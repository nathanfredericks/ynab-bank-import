import { tz } from "@date-fns/tz";
import { config } from "@dotenvx/dotenvx";
import { parseISO } from "date-fns";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

config({
  quiet: true,
});

const Account = z
  .object({
    type: z.enum(["CHEQUING", "SAVINGS", "CREDIT_CARD"]),
    number: z.string(),
    account_balance: z.number(),
  })
  .transform((account) => ({
    id: uuidv5(account.number, process.env.UUID_NAMESPACE || ""),
    accountNumber: account.number,
    balance:
      account.account_balance * (account.type === "CREDIT_CARD" ? -1 : 1),
  }));

const AccountResponse = z
  .object({
    accounts: z.array(Account),
  })
  .transform(({ accounts }) => accounts);

const Transaction = z
  .object({
    transaction_date: z.string(),
    amount: z.number(),
    description: z.string(),
    is_uncleared: z.boolean(),
    status: z.string(),
  })
  .transform((transaction) => ({
    date: parseISO(transaction.transaction_date, {
      in: tz("UTC"),
    }),
    amount: transaction.amount,
    description: transaction.description,
  }));

const TransactionsResponse = z.object({
  transactions: z.array(Transaction),
});

export { Account, AccountResponse, TransactionsResponse };
