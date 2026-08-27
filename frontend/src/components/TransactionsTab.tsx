import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { Category, Transaction } from "../types";
import {
  buildUpdatePayload,
  filterTransactions,
  type TransactionFilter,
} from "../lib/dashboardHelpers";
import { TransactionRow } from "./TransactionRow";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface TransactionsTabProps {
  month: string;
  onMonthChange: (month: string) => void;
  transactions: Transaction[] | null;
  categories: Category[];
  locked: boolean;
  onSave: (id: string, payload: ReturnType<typeof buildUpdatePayload>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TransactionsTab({
  month,
  onMonthChange,
  transactions,
  categories,
  locked,
  onSave,
  onDelete,
}: TransactionsTabProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionFilter>("ALL");

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions ?? [], query, typeFilter),
    [query, transactions, typeFilter],
  );
  const filtersActive = query.trim().length > 0 || typeFilter !== "ALL";

  return (
    <section className="min-w-0 space-y-4" aria-labelledby="transactions-title">
      <Card className="premium-card overflow-hidden">
        <CardHeader className="gap-4 border-b border-border p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle id="transactions-title" className="text-xl">עסקאות</CardTitle>
              <p className="mt-1 text-sm text-muted">איתור, סינון וניהול של הפעילות החודשית</p>
            </div>
            {transactions !== null && (
              <p className="text-sm text-muted" aria-live="polite">
                {filteredTransactions.length} מתוך {transactions.length} עסקאות
              </p>
            )}
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(14rem,1fr)_12rem_auto] lg:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="transaction-search">חיפוש עסקאות</Label>
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <Input
                  id="transaction-search"
                  type="search"
                  value={query}
                  disabled={locked}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="קטגוריה, הערה, בית עסק או משתמש"
                  className="min-w-0 pr-10"
                />
              </div>
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="transactions-month">חודש</Label>
              <Input
                id="transactions-month"
                type="month"
                value={month}
                disabled={locked}
                onChange={(event) => onMonthChange(event.target.value)}
                className="min-w-0 max-w-full"
              />
            </div>

            <div
              role="radiogroup"
              aria-label="סינון לפי סוג עסקה"
              className="grid h-10 min-w-0 w-full grid-cols-3 items-center rounded-lg border border-border bg-bg p-1 text-muted"
            >
              {([
                ["ALL", "הכל"],
                ["EXPENSE", "הוצאות"],
                ["INCOME", "הכנסות"],
              ] as const).map(([value, label]) => {
                const selected = typeFilter === value;
                return (
                  <Button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    variant="ghost"
                    disabled={locked}
                    onClick={() => setTypeFilter(value)}
                    className={`h-full min-w-0 rounded-md px-3 py-1.5 ${selected ? "bg-surface-raised text-text shadow-sm hover:bg-surface-raised" : "text-muted hover:text-text"}`}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-4">
          {transactions === null ? (
            <p className="py-10 text-center text-sm text-muted" role="status">טוען עסקאות...</p>
          ) : filteredTransactions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-bg/40 px-4 py-10 text-center">
              <p className="font-medium text-text">
                {filtersActive ? "לא נמצאו עסקאות שמתאימות לסינון" : "אין עסקאות בחודש הזה"}
              </p>
              {filtersActive && <p className="mt-1 text-sm text-muted">נסה לשנות את החיפוש או לבחור סוג אחר.</p>}
            </div>
          ) : (
            <div role="list" className="space-y-2">
              {filteredTransactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categories={categories}
                  locked={locked}
                  onSave={onSave}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
