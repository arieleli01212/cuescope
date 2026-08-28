export type TransactionType = "EXPENSE" | "INCOME";
export type Currency = "ILS" | "USD" | "EUR";

export interface Category {
  id: string;
  name: string;
  group?: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number | string;
  currency: Currency;
  note?: string | null;
  merchant?: string | null;
  occurredAt: string;
  category?: { id: string; name: string } | null;
  categoryId?: string;
  user?: { name: string } | null;
}

export interface SummaryByCategory {
  name: string;
  expense: number | string;
}

export interface SummaryByGroup {
  name: string;
  expense: number | string;
}

export interface Summary {
  totalIncome: number | string;
  totalExpense: number | string;
  balance: number | string;
  byCategory: SummaryByCategory[];
  byGroup: SummaryByGroup[];
}

export interface Me {
  name: string;
}

export type ImportAdapter = "credit-card-xlsx-v1";
export type ImportSuggestionSource = "explicit" | "history" | "fallback";

export interface ImportRowPayload {
  rowNumber: number;
  occurredAt: string;
  merchant: string;
  amount: number;
  currency: Currency;
  chargedAmount: number;
  chargedCurrency: Currency;
  sourceReferenceHash: string;
}

export interface ImportRejectedRow {
  rowNumber: number;
  code: string;
  message: string;
}

export interface ImportMerchantGroup {
  key: string;
  displayName: string;
  rowCount: number;
  suggestedCategoryId: string;
  suggestionSource: ImportSuggestionSource;
}

export interface ImportPreviewRequest {
  adapter: ImportAdapter;
  rows: ImportRowPayload[];
  categoryMappings: Record<string, string>;
}

export interface ImportPreview {
  adapter: ImportAdapter;
  validCount: number;
  duplicateCount: number;
  rejected: ImportRejectedRow[];
  merchantGroups: ImportMerchantGroup[];
}

export interface ConfirmImportRequest extends ImportPreviewRequest {
  rejectedRows: Array<{ rowNumber: number; code: string }>;
}

export interface ImportResult {
  id: string;
  adapter: ImportAdapter;
  importedCount: number;
  skippedCount: number;
  rejectedCount: number;
}
