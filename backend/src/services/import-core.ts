import { createHash } from "node:crypto";

export const IMPORT_ADAPTER = "credit-card-xlsx-v1" as const;
export const BASE_CURRENCY = "ILS" as const;
export type ImportCurrency = "ILS" | "USD" | "EUR";

export interface FingerprintRow {
  adapter: typeof IMPORT_ADAPTER;
  occurredAt: string;
  merchant: string;
  amount: number;
  currency: ImportCurrency;
  chargedAmount: number;
  chargedCurrency: ImportCurrency;
  sourceReferenceHash: string;
}

export function canonicalMerchant(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("he-IL").replace(/\s+/g, " ");
}

function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Amount must be finite");
  return value.toFixed(6);
}

export function computeImportFingerprint(userId: string, row: FingerprintRow): string {
  const canonical = [
    userId,
    row.adapter,
    row.occurredAt.slice(0, 10),
    canonicalMerchant(row.merchant),
    canonicalNumber(row.amount),
    row.currency,
    canonicalNumber(row.chargedAmount),
    row.chargedCurrency,
    row.sourceReferenceHash,
  ].join("\u001f");
  return createHash("sha256").update(canonical).digest("hex");
}

export function deriveStatementAmounts(input: {
  amount: number;
  currency: ImportCurrency;
  chargedAmount: number;
  chargedCurrency: ImportCurrency;
}) {
  if (!Number.isFinite(input.amount) || !Number.isFinite(input.chargedAmount)) {
    throw new Error("Amounts must be finite");
  }
  if (input.amount <= 0 || input.chargedAmount <= 0) {
    throw new Error("Refunds and zero-value rows are unsupported");
  }
  if (input.chargedCurrency !== BASE_CURRENCY) {
    throw new Error("Charged currency must match the CueScope base currency");
  }
  return {
    amount: input.amount,
    amountBase: input.chargedAmount,
    exchangeRate: input.chargedAmount / input.amount,
  };
}
