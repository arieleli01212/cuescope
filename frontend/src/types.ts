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
