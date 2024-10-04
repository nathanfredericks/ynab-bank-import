import { z } from "zod";

const Transaction = z.object({
  date: z.date(),
  description: z.string(),
  amount: z.number(),
});

const Account = z.object({
  id: z.string(),
  balance: z.number(),
  transactions: z.array(Transaction),
});

export { Account };
