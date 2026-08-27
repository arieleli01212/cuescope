import { z } from "zod";

export const createTransactionSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]),
  amount: z.coerce.number().positive(),
  currency: z.enum(["ILS", "USD", "EUR"]).default("ILS"),
  // מותר לשלוח category קיים (categoryId) או שם חדש (categoryName) שייווצר
  // אוטומטית אם עוד לא קיים - זה בדיוק ה"הוסף קטגוריה חדשה" מה-Shortcut.
  categoryId: z.string().uuid().optional(),
  categoryName: z.string().trim().min(1).max(50).optional(),
  // שם בית העסק - מגיע מה-Transaction trigger של Apple Pay (Wallet) כשאין
  // בחירת קטגוריה ידנית. כשהוא היחיד שסופק, הקטגוריה נקבעת בשרת: לפי בית
  // עסק זהה שכבר נרשם בעבר, ואם אין - "אחר".
  merchant: z.string().trim().min(1).max(200).optional(),
  note: z.string().trim().max(500).optional(),
  occurredAt: z.coerce.date().optional(),
}).refine((data) => data.categoryId || data.categoryName || data.merchant, {
  message: "One of categoryId, categoryName, or merchant is required",
});

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
  amount: z.coerce.number().positive().optional(),
  currency: z.enum(["ILS", "USD", "EUR"]).optional(),
  categoryId: z.string().uuid().optional(),
  merchant: z.string().trim().min(1).max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
});

export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;

export const listTransactionsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // "2026-08"
  categoryId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  type: z.enum(["EXPENSE", "INCOME"]).optional(),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;

export const summaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // חובה - הדוח תמיד לפי חודש
});

export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const transactionIdParamsSchema = z.object({
  id: z.string().uuid(),
});
