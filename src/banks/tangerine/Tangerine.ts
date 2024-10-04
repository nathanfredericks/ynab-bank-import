import { formatISO, subDays } from "date-fns";
import { z } from "zod";
import {
  formatCookiesToString,
  getSMSTwoFactorAuthenticationCode,
  getTraceFilePath,
  logger,
} from "../../utils.js";
import { Bank } from "../Bank.js";
import { Account, AccountResponse, TransactionsResponse } from "./schemas.js";

export class Tangerine extends Bank {
  public static async create(loginID: string, pin: string) {
    const tangerine = new Tangerine();
    try {
      await tangerine.launchBrowser(true);
      await tangerine.login(loginID, pin);
      await tangerine.closeBrowser();
    } catch (error) {
      logger.error(error);
      const traceFilePath = getTraceFilePath(tangerine.date, "bmo");
      await tangerine.closeBrowser(traceFilePath);
      logger.info(`Trace saved to ${traceFilePath}`);
    }
    return tangerine;
  }

  private async fetchAccounts() {
    const page = await this.getPage();

    logger.debug("Fetching accounts from Tangerine");
    const response = await page.waitForResponse(
      (response) =>
        response.url() ===
          "https://secure.tangerine.ca/web/rest/pfm/v1/accounts" &&
        response.request().method() === "GET",
    );
    const json = await response.json();
    const accounts = AccountResponse.parse(json);
    logger.debug(
      `Fetched ${accounts.length} accounts from Tangerine`,
      accounts,
    );

    return await Promise.all(
      accounts.map(async (account) => {
        return {
          ...account,
          transactions: await this.fetchTransactions(account.accountNumber),
        };
      }),
    );
  }

  private async fetchTransactions(
    accountNumber: z.infer<typeof Account>["accountNumber"],
  ) {
    const page = await this.getPage();

    logger.debug(`Fetching transactions for account ${accountNumber}`);
    const response = await fetch(
      "https://secure.tangerine.ca/web/rest/pfm/v1/transactions?" +
        new URLSearchParams({
          accountIdentifiers: accountNumber,
          hideAuthorizedStatus: "true",
          periodFrom: formatISO(subDays(this.date, 10), {
            representation: "date",
          }),
        }).toString(),
      {
        headers: {
          "Accept-Language": "en_CA",
          Cookie: formatCookiesToString(await page.context().cookies()),
        },
      },
    );
    const json = await response.json();
    const { transactions } = TransactionsResponse.parse(json);
    logger.debug(
      `Fetched ${transactions.length} transactions for account ${accountNumber}`,
      transactions,
    );
    return transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private async login(loginID: string, pin: string) {
    const page = await this.getPage();

    logger.debug("Navigating to Tangerine login page");
    await page.goto(
      "https://www.tangerine.ca/app/#/login/login-id?locale=en_CA",
    );

    logger.debug("Accepting cookies");
    await page.waitForSelector("#onetrust-accept-btn-handler");
    await page.click("#onetrust-accept-btn-handler");

    logger.debug("Filing in login ID");
    await page.getByRole("textbox", { name: "Login ID" }).fill(loginID);
    await page.getByRole("button", { name: "Next" }).click();

    logger.debug("Filing in PIN");
    await page.getByRole("textbox", { name: "PIN" }).fill(pin);
    await page.getByRole("button", { name: "Log In" }).click();

    logger.debug("Two-factor authentication required");
    logger.debug("Filling in two-factor authentication code");
    const code = await getSMSTwoFactorAuthenticationCode(this.date);
    await page.getByRole("textbox", { name: "Security Code" }).fill(code);
    await page.getByRole("button", { name: "Log In" }).click();

    const accounts = await this.fetchAccounts();
    this.setAccounts(accounts.map(({ accountNumber, ...account }) => account));
  }
}
