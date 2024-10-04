import { tz } from "@date-fns/tz";
import { config } from "@dotenvx/dotenvx";
import { Command } from "commander";
import { formatISO } from "date-fns";
import * as ynab from "ynab";
import { z } from "zod";
import { BankOfMontreal } from "./banks/bank-of-montreal/BankOfMontreal.js";
import { ManulifeBank } from "./banks/manulife-bank/ManulifeBank.js";
import { Tangerine } from "./banks/tangerine/Tangerine.js";
import { Account } from "./banks/types.js";
import { logger } from "./utils.js";

config({
  quiet: true,
});

const ynabAPI = new ynab.API(process.env.YNAB_ACCESS_TOKEN || "");

async function importTransactions(accounts: z.infer<typeof Account>[]) {
  logger.debug("Importing transactions to YNAB");
  logger.debug("Fetching YNAB accounts");
  const ynabAccounts = await ynabAPI.accounts
    .getAccounts(process.env.YNAB_BUDGET_ID || "")
    .then((response) =>
      response.data.accounts.filter((account) => !account.deleted),
    );
  const importedTransactionMap: Record<string, number> = {};
  logger.debug("Importing transactions");
  const {
    data: { transactions },
  } = await ynabAPI.transactions.createTransactions(
    process.env.YNAB_BUDGET_ID || "",
    {
      transactions: accounts.flatMap((account) =>
        account.transactions.map((transaction) => {
          const accountId = ynabAccounts.find((ynabAccount) =>
            ynabAccount.note?.includes(account.id),
          )?.id;
          const date = formatISO(transaction.date, {
            representation: "date",
            in: tz(process.env.TZ || ""),
          });
          const amount = Math.round(transaction.amount * 1000);
          const key = `${accountId}:${amount}:${date}`;

          if (importedTransactionMap[key]) {
            importedTransactionMap[key]++;
          } else {
            importedTransactionMap[key] = 1;
          }

          return {
            account_id: accountId,
            date,
            amount,
            payee_name: transaction.description,
            cleared: "cleared",
            import_id: `YNAB:${amount}:${date}:${importedTransactionMap[key]}`,
          };
        }),
      ),
    },
  );
  logger.debug(`Imported ${transactions?.length} transactions`, transactions);
}

(async () => {
  const program = new Command()
    .name("ynab-bank-import")
    .version("1.0.0")
    .requiredOption("-b, --bank <bank>", "bank to import transactions from")
    .parse(process.argv);

  const { bank } = program.opts();

  try {
    switch (bank) {
      case "bmo":
        logger.info("Importing transactions from Bank of Montreal");
        const bmo = await BankOfMontreal.create(
          process.env.BMO_CARD_NUMBER || "",
          process.env.BMO_PASSWORD || "",
        );
        const bmoAccounts = bmo.getAccounts();
        if (!bmoAccounts.length) {
          logger.error("Error fetching accounts from Bank of Montreal");
          process.exit(1);
        }
        await importTransactions(bmo.getAccounts());
        logger.info("Imported transactions from Bank of Montreal");
        break;
      case "tangerine":
        logger.info("Importing transactions from Tangerine");
        const tangerine = await Tangerine.create(
          process.env.TANGERINE_LOGIN_ID || "",
          process.env.TANGERINE_PIN || "",
        );
        const tangerineAccounts = tangerine.getAccounts();
        if (!tangerineAccounts.length) {
          logger.error("Error fetching accounts from Tangerine");
          process.exit(1);
        }
        await importTransactions(tangerine.getAccounts());
        logger.info("Imported transactions from Tangerine");
        break;
      case "manulife-bank":
        logger.info("Importing transactions from Manulife Bank");
        const manulifeBank = await ManulifeBank.create(
          process.env.MANULIFE_BANK_USERNAME || "",
          process.env.MANULIFE_BANK_PASSWORD || "",
        );
        const manulifeBankAccounts = manulifeBank.getAccounts();
        if (!manulifeBankAccounts.length) {
          logger.error("Error fetching accounts from Manulife Bank");
          process.exit(1);
        }
        await importTransactions(manulifeBankAccounts);
        logger.info("Imported transactions from Manulife Bank");
        break;
      default:
        logger.error("Unsupported bank");
    }
  } catch (error) {
    console.error(error);
  }
})();
