// לוגיקה טהורה שהופרדה מבניית ה-DOM: הועברה 1:1 מ-dashboard-helpers.js
// הישן (גרסת ה-vanilla JS). בוני ה-markup (buildTransactionMarkup וכו')
// לא הועברו - React מרנדר JSX במקום מחרוזות HTML, ר' הקומפוננטות תחת
// src/components. הפונקציות הטהורות האלה עדיין נבדקות ב-test/dashboard-helpers.test.js.

import type { Category, Transaction } from "../types";

export const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", USD: "$", EUR: "€" };

export type TransactionFilter = "ALL" | "EXPENSE" | "INCOME";

export interface LatestRequestGate {
  issue: () => number;
  isCurrent: (token: number) => boolean;
}

export function createLatestRequestGate(): LatestRequestGate {
  let latestToken = 0;
  return {
    issue: () => ++latestToken,
    isCurrent: (token) => token === latestToken,
  };
}

export async function settleRefreshes(refreshes: Iterable<PromiseLike<unknown>>): Promise<void> {
  await Promise.allSettled(refreshes);
}

export interface CategoryGroup {
  key: string;
  name: string;
  categories: Category[];
}

export function groupCategories(categories: Category[]): CategoryGroup[] {
  const groups = new Map<string, Category[]>();

  for (const category of categories) {
    const normalizedName = category.group?.trim();
    const key = normalizedName ? `group:${normalizedName}` : "ungrouped";
    const grouped = groups.get(key);
    if (grouped) grouped.push(category);
    else groups.set(key, [category]);
  }

  return Array.from(groups, ([key, groupedCategories]) => ({
    key,
    name: key === "ungrouped" ? "ללא נושא" : key.slice("group:".length),
    categories: groupedCategories,
  }));
}

export function filterTransactions(
  items: Transaction[],
  query: string,
  type: TransactionFilter,
): Transaction[] {
  const needle = query.trim().toLocaleLowerCase("he-IL");

  return items.filter((item) => {
    if (type !== "ALL" && item.type !== type) return false;
    if (!needle) return true;

    return [item.category?.name, item.note, item.merchant, item.user?.name]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("he-IL").includes(needle));
  });
}

export interface UpdatePayloadFields {
  type: string;
  amount: string | number;
  currency: string;
  categoryId: string;
  note?: string;
}

export function buildUpdatePayload(fields: UpdatePayloadFields) {
  const note = String(fields.note ?? "").trim();
  return {
    type: fields.type,
    amount: Number(fields.amount),
    currency: fields.currency,
    categoryId: fields.categoryId,
    note: note || null,
  };
}

export function hasChartData(series: Array<number | string>): boolean {
  return Array.isArray(series) && series.some((value) => Number(value) > 0);
}

export function buildChartAriaLabel(labels: string[], data: Array<number | string>): string {
  if (!hasChartData(data)) return "אין נתונים להצגה";
  return labels.map((label, i) => `${label}: ${Number(data[i]).toFixed(2)}`).join(", ");
}

export function shouldRefreshTransactions({
  editorOpen = false,
  submitting = false,
  force = false,
  postMutation = false,
}: {
  editorOpen?: boolean;
  submitting?: boolean;
  force?: boolean;
  postMutation?: boolean;
} = {}): boolean {
  if (submitting) return postMutation;
  return force || !editorOpen;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
