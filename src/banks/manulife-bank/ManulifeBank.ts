import { formatISO, subDays } from "date-fns";
import { z } from "zod";
import {
  getSMSTwoFactorAuthenticationCode,
  getTraceFilePath,
  logger,
} from "../../utils.js";
import { Bank } from "../Bank.js";
import { Account, AccountResponse, TransactionsResponse } from "./schemas.js";

export class ManulifeBank extends Bank {
  public static async create(username: string, password: string) {
    const manulifeBank = new ManulifeBank();
    try {
      await manulifeBank.launchBrowser();
      await manulifeBank.login(username, password);
      await manulifeBank.closeBrowser();
    } catch (error) {
      logger.error(error);
      const traceFilePath = getTraceFilePath(
        manulifeBank.date,
        "manulife-bank",
      );
      await manulifeBank.closeBrowser(traceFilePath);
      logger.info(`Trace saved to ${traceFilePath}`);
    }
    return manulifeBank;
  }

  private async fetchAccounts() {
    const page = await this.getPage();

    logger.debug("Fetching accounts from Manulife Bank");
    const response = await page.waitForResponse(
      (response) =>
        response.url() ===
          "https://online.manulifebank.ca/api/v9/bank/ca/v2/accounts/" &&
        response.request().method() === "GET",
    );
    const json = await response.json();
    const accounts = AccountResponse.parse(json);
    logger.debug(
      `Fetched ${accounts.length} accounts from Manulife Bank`,
      accounts,
    );

    return await Promise.all(
      accounts.map(async (account) => {
        return {
          ...account,
          transactions: await this.fetchTransactions(
            account.accountIndex,
            (await response.request().headerValue("Cookie")) || "",
          ),
        };
      }),
    );
  }

  private async fetchTransactions(
    accountIndex: z.infer<typeof Account>["accountIndex"],
    cookies: string,
  ) {
    logger.debug(`Fetching transactions for account ${accountIndex}`);
    const response = await fetch(
      `https://online.manulifebank.ca/api/v9/bank/ca/v2/accounts/history/${accountIndex}/start/${formatISO(subDays(this.date, 10), { representation: "date" })}/end/${formatISO(this.date, { representation: "date" })}`,
      {
        headers: {
          Cookie: cookies,
        },
      },
    );
    const json = await response.json();
    const {
      historyTransactions: { transaction: transactions },
    } = TransactionsResponse.parse(json);
    logger.debug(
      `Fetched ${transactions.length} transactions for account ${accountIndex}`,
      transactions,
    );
    return transactions;
  }

  async login(username: string, password: string): Promise<void> {
    const page = await this.getPage();
    logger.debug("Navigating to Manulife Bank login page");
    await page.goto("https://online.manulifebank.ca/accounts");

    await page.getByRole("button", { name: "Sign in" }).click();

    logger.debug("Filling in username and password");
    await page.getByRole("textbox", { name: "Username" }).click();
    await page.getByRole("textbox", { name: "Username" }).fill(username);
    await page.getByRole("textbox", { name: "Password" }).click();
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    logger.debug("Waiting for response");
    await page.waitForURL(
      (url) =>
        url.toString().startsWith("https://id.manulife.ca/otp-on-demand") ||
        url.toString().startsWith("https://id.manulife.ca/mfa") ||
        url.toString() === "https://online.manulifebank.ca/init",
    );

    const isTwoFactorAuthenticationRequired =
      page.url() !== "https://online.manulifebank.ca/init";
    if (isTwoFactorAuthenticationRequired) {
      logger.debug("Two-factor authentication required");
      logger.debug("Filling in two-factor authentication code");
      await page.getByRole("button", { name: "Text" }).click();
      const code = await getSMSTwoFactorAuthenticationCode(this.date);
      await page.getByRole("textbox", { name: "Code" }).fill(code);
      await page.getByRole("button", { name: "Continue" }).click();

      const accounts = await this.fetchAccounts();
      this.setAccounts(accounts.map(({ accountIndex, ...account }) => account));
    } else {
      const accounts = await this.fetchAccounts();
      this.setAccounts(accounts.map(({ accountIndex, ...account }) => account));
    }
  }
}
