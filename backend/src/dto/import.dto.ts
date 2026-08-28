import { z } from "zod";

import { IMPORT_ADAPTER } from "../services/import-core";

const currencySchema = z.enum(["ILS", "USD", "EUR"]);

export const importRowSchema = z.object({
  rowNumber: z.number().int().min(1).max(5000),
  occurredAt: z.string().datetime(),
  merchant: z.string().trim().min(1).max(200),
  amount: z.number().finite().positive(),
  currency: currencySchema,
  chargedAmount: z.number().finite().positive(),
  chargedCurrency: currencySchema,
  sourceReferenceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const payloadBase = z.object({
  adapter: z.literal(IMPORT_ADAPTER),
  rows: z.array(importRowSchema).min(1).max(5000),
  categoryMappings: z.record(z.string().min(1), z.string().uuid()).default({}),
});

export const previewImportSchema = payloadBase;

const rejectedRowSchema = z.object({
  rowNumber: z.number().int().min(1).max(5000),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
}).strict();

export const confirmImportSchema = payloadBase.extend({
  rejectedRows: z.array(rejectedRowSchema).max(5000).default([]),
}).strict().superRefine((payload, context) => {
  if (payload.rows.length + payload.rejectedRows.length > 5000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectedRows"],
      message: "Combined row count must not exceed 5000",
    });
  }

  const validRowNumbers = new Set(payload.rows.map(({ rowNumber }) => rowNumber));
  const rejectedRowNumbers = new Set<number>();
  for (const [index, rejectedRow] of payload.rejectedRows.entries()) {
    if (rejectedRowNumbers.has(rejectedRow.rowNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedRows", index, "rowNumber"],
        message: "Rejected row numbers must be unique",
      });
    }
    if (validRowNumbers.has(rejectedRow.rowNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedRows", index, "rowNumber"],
        message: "Rejected row numbers must not identify valid rows",
      });
    }
    rejectedRowNumbers.add(rejectedRow.rowNumber);
  }
});

export const importIdParamsSchema = z.object({ id: z.string().uuid() });
