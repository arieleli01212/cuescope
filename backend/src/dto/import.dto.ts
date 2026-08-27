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

export const confirmImportSchema = payloadBase.extend({
  rejectedCount: z.number().int().min(0).max(5000).default(0),
});

export const importIdParamsSchema = z.object({ id: z.string().uuid() });
