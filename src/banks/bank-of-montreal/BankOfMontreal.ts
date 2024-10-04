import { isAfter, subDays } from "date-fns";
import {
  getEmailTwoFactorAuthenticationCode,
  getTraceFilePath,
  logger,
} from "../../utils.js";
import { Bank } from "../Bank.js";

import {
  BankAccountTransactionsResponse,
  CreditCardTransactionsResponse,
  VerifyCredentialResponse,
} from "./schemas.js";

export class BankOfMontreal extends Bank {
  public static async create(cardNumber: string, password: string) {
    const bmo = new BankOfMontreal();
    try {
      await bmo.launchBrowser(true);
      await bmo.login(cardNumber, password);
      await bmo.closeBrowser();
    } catch (error) {
      logger.error(error);
      const traceFilePath = getTraceFilePath(bmo.date, "bmo");
      await bmo.closeBrowser(traceFilePath);
      logger.info(`Trace saved to ${traceFilePath}`);
    }
    return bmo;
  }

  private async fetchAccounts() {
    const page = await this.getPage();
    logger.debug("Fetching accounts from BMO");
    await page.waitForURL("https://www1.bmo.com/banking/digital/accounts", {
      waitUntil: "domcontentloaded",
    });
    const accountListGroupItems = await page
      .locator(
        '//div[@id="accounts-container-BANK_ACCOUNTS" or @id="accounts-container-CREDIT_CARDS"]//app-accounts-list-group-item',
      )
      .all();
    const accounts = [];
    for (const accountListGroupItem of accountListGroupItems) {
      logger.debug("Fetching account details");
      await accountListGroupItem.click();
      logger.debug("Waiting for response");
      const response = await page.waitForResponse(
        (response) =>
          (response.url() ===
            "https://www1.bmo.com/banking/services/accountdetails/getBankAccountDetails" ||
            response.url() ===
              "https://www1.bmo.com/banking/services/accountdetails/getCCAccountDetails") &&
          response.request().method() === "POST",
      );
      const json = await response.json();
      if (
        response.url() ===
        "https://www1.bmo.com/banking/services/accountdetails/getBankAccountDetails"
      ) {
        const account = BankAccountTransactionsResponse.parse(json);
        account.transactions = account.transactions
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .filter((transaction) =>
            isAfter(transaction.date, subDays(this.date, 10)),
          );
        accounts.push(account);
        logger.debug("Fetched bank account from BMO", account);
      } else {
        const account = CreditCardTransactionsResponse.parse(json);
        account.transactions = account.transactions
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .filter((transaction) =>
            isAfter(transaction.date, subDays(this.date, 10)),
          );
        accounts.push(account);
        logger.debug("Fetched credit card from BMO", account);
      }
      logger.debug("Navigating back to accounts page");
      await page.goBack();
      await page.waitForURL("https://www1.bmo.com/banking/digital/accounts", {
        waitUntil: "domcontentloaded",
      });
    }
    return accounts;
  }

  private async login(cardNumber: string, password: string) {
    const page = await this.getPage();
    logger.debug("Navigating to BMO login page");
    await page.goto("https://www1.bmo.com/banking/digital/login");

    logger.debug("Filling in card number and password");
    await page
      .getByRole("textbox", { name: "Card number" })
      .pressSequentially(cardNumber);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    logger.debug("Waiting for response");
    const response = await page.waitForResponse(
      (response) =>
        response.url() ===
          "https://www1.bmo.com/banking/services/signin/verifyCredential" &&
        response.request().method() === "POST",
    );
    const json = await response.json();
    const { isTwoFactorAuthenticationRequired } =
      VerifyCredentialResponse.parse(json);

    if (isTwoFactorAuthenticationRequired) {
      logger.debug("Two-factor authentication required");
      logger.debug("Filling in two-factor authentication code");
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("radio", { name: "Email" }).click();
      await page
        .getByRole("checkbox", {
          name: "IMPORTANT: To proceed, you must confirm you will not provide this verification code to anyone.",
        })
        .click();
      await page.getByRole("button", { name: "Send code" }).click();
      const code = await getEmailTwoFactorAuthenticationCode(this.date);
      await page.getByRole("textbox", { name: "Verification code" }).fill(code);
      await page.getByRole("button", { name: "Confirm" }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      this.setAccounts(await this.fetchAccounts());
    } else {
      this.setAccounts(await this.fetchAccounts());
    }
  }
}
