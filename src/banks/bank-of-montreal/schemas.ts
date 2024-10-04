import { config } from "@dotenvx/dotenvx";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

config({
  quiet: true,
});

const BankAccount = z
  .object({
    accountNumber: z.string(),
    accountBalance: z.string(),
  })
  .transform((account) => ({
    id: uuidv5(account.accountNumber, process.env.UUID_NAMESPACE || ""),
    balance: parseFloat(account.accountBalance),
  }));

const CreditCard = z
  .object({
    accountNumber: z.string(),
    currentBalance: z.string(),
  })
  .transform((account) => ({
    id: uuidv5(account.accountNumber, process.env.UUID_NAMESPACE || ""),
    balance: parseFloat(account.currentBalance) * -1,
  }));

const VerifyCredentialResponse = z
  .object({
    VerifyCredentialRs: z.object({
      BodyRs: z.object({
        isOTPSignIn: z.enum(["Y", "N"]),
      }),
    }),
  })
  .transform(({ VerifyCredentialRs: { BodyRs: response } }) => ({
    isTwoFactorAuthenticationRequired: response.isOTPSignIn === "Y",
  }));

const BankAccountTransaction = z
  .object({
    txnDate: z.string(),
    descr: z.string(),
    txnAmount: z.string(),
  })
  .transform((transaction) => ({
    date: new Date(transaction.txnDate),
    description: transaction.descr.replace(/\s+/g, " ").trim(),
    amount: parseFloat(transaction.txnAmount),
  }));

const BankAccountTransactionsResponse = z
  .object({
    GetBankAccountDetailsRs: z.object({
      BodyRs: z.object({
        bankAccountDetails: BankAccount,
        bankAccountTransactions: z.array(BankAccountTransaction),
      }),
    }),
  })
  .transform(({ GetBankAccountDetailsRs: { BodyRs: response } }) => ({
    ...response.bankAccountDetails,
    transactions: response.bankAccountTransactions,
  }));

const CreditCardTransaction = z
  .object({
    txnDate: z.string(),
    postDate: z.string(),
    descr: z.string(),
    txnIndicator: z.literal("CR").optional(),
    amount: z.string(),
  })
  .transform((transaction) => {
    const isCredit = transaction.txnIndicator === "CR";
    return {
      date: new Date(isCredit ? transaction.postDate : transaction.txnDate),
      amount: parseFloat(transaction.amount) * (isCredit ? 1 : -1),
      description: transaction.descr.replace(/\s+/g, " ").trim(),
    };
  });

const CreditCardTransactionsResponse = z
  .object({
    GetCCAccountDetailsRs: z.object({
      BodyRs: z.object({
        creditCardDetails: CreditCard,
        lendingTransactions: z.preprocess((transactions) => {
          if (!Array.isArray(transactions)) return [];
          return transactions.filter(
            (transaction) =>
              !!transaction.postDate && !!transaction.merchantName,
          );
        }, z.array(CreditCardTransaction)),
      }),
    }),
  })
  .transform(({ GetCCAccountDetailsRs: { BodyRs: response } }) => ({
    ...response.creditCardDetails,
    transactions: response.lendingTransactions,
  }));

export {
  BankAccountTransactionsResponse,
  CreditCardTransactionsResponse,
  VerifyCredentialResponse,
};
