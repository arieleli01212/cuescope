import type { Currency } from "../types";

export const IMPORT_ADAPTER_ID = "credit-card-xlsx-v1" as const;

export interface ParsedImportRow {
  rowNumber: number;
  occurredAt: string;
  merchant: string;
  amount: number;
  currency: Currency;
  chargedAmount: number;
  chargedCurrency: Currency;
  sourceReferenceHash: string;
}

export interface RejectedImportRow {
  rowNumber: number;
  code: string;
  message: string;
}

export interface ParsedImportFile {
  adapter: typeof IMPORT_ADAPTER_ID;
  rows: ParsedImportRow[];
  rejected: RejectedImportRow[];
  dateRange: { from: string; to: string } | null;
  currencies: Currency[];
  chargedTotal: number;
}

export interface ImportFileAdapter {
  adapter: typeof IMPORT_ADAPTER_ID;
  parse(file: File): Promise<ParsedImportFile>;
}
