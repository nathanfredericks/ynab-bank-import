import { config } from "@dotenvx/dotenvx";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

config({
  quiet: true,
});

const Account = z
  .object({
    id: z.string(),
    accountId: z.object({
      accountNumber: z.string(),
    }),
    balance: z.number(),
  })
  .transform((account) => ({
    id: uuidv5(
      account.accountId.accountNumber,
      process.env.UUID_NAMESPACE || "",
    ),
    accountIndex: account.id,
    balance: account.balance,
  }));

const AccountResponse = z
  .object({
    assetAccounts: z.object({
      assetAccount: z.preprocess((accounts) => {
        if (!Array.isArray(accounts)) return [];
        return accounts.filter(
          (account) =>
            account.accountId.accountType === "ADVM",
        );
      }, z.array(Account)),
    }),
  })
  .transform(({ assetAccounts: { assetAccount: accounts } }) => accounts);

const Transaction = z
  .object({
    date: z.number(),
    description: z.string(),
    transactionAmount: z.number(),
  })
  .transform((transaction) => ({
    date: new Date(transaction.date),
    amount: transaction.transactionAmount,
    description: transaction.description,
  }));

const TransactionsResponse = z.object({
  historyTransactions: z.object({
    transaction: z.array(Transaction),
  }),
});

export { Account, AccountResponse, TransactionsResponse };
