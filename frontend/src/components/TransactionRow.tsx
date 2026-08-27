import { useState, type FormEvent, type MouseEvent } from "react";
import type { Category, Transaction } from "../types";
import { CURRENCY_SYMBOLS, buildUpdatePayload } from "../lib/dashboardHelpers";
import { PencilIcon, TrashIcon } from "./icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface TransactionRowProps {
  transaction: Transaction;
  categories: Category[];
  locked: boolean;
  onSave: (id: string, payload: ReturnType<typeof buildUpdatePayload>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TransactionRow({ transaction, categories, locked, onSave, onDelete }: TransactionRowProps) {
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoryId = transaction.category?.id ?? transaction.categoryId ?? "";
  const amount = Number(transaction.amount);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const sign = transaction.type === "INCOME" ? "+" : "−";
  const symbol = CURRENCY_SYMBOLS[transaction.currency] || transaction.currency;
  const formattedDate = new Date(transaction.occurredAt).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
  });

  const editableCategories = categoryId && !categories.some((category) => String(category.id) === String(categoryId))
    ? [{ id: categoryId, name: transaction.category?.name || "קטגוריה נוכחית" }, ...categories]
    : categories;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = buildUpdatePayload({
      type: String(form.get("type")),
      amount: String(form.get("amount")),
      currency: String(form.get("currency")),
      categoryId: String(form.get("categoryId")),
      note: String(form.get("note") ?? ""),
    });

    try {
      await onSave(transaction.id, payload);
      setSubmitting(false);
      setEditing(false);
    } catch (err) {
      setSubmitting(false);
      setError("שגיאה בשמירה: " + (err as Error).message);
    }
  }

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete(transaction.id);
      setDeleting(false);
      setDeleteOpen(false);
    } catch (err) {
      setDeleting(false);
      setDeleteError("שגיאה במחיקה: " + (err as Error).message);
    }
  }

  return (
    <article
      role="listitem"
      className="group min-w-0 rounded-xl border border-border bg-surface-raised/65 p-3 transition-colors hover:border-primary/30 hover:bg-surface-raised sm:p-4"
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="max-w-full border-primary/25 bg-primary/5 text-primary">
              <span className="truncate">{transaction.category?.name || "ללא קטגוריה"}</span>
            </Badge>
            <Badge variant="secondary" className="shrink-0">
              {transaction.type === "INCOME" ? "הכנסה" : "הוצאה"}
            </Badge>
          </div>
          {transaction.note && <p className="mt-2 truncate text-sm font-medium text-text">{transaction.note}</p>}
          <p className="mt-1 truncate text-xs text-muted">
            {formattedDate}
            {transaction.user?.name ? ` · ${transaction.user.name}` : ""}
            {transaction.merchant ? ` · ${transaction.merchant}` : ""}
          </p>
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 sm:shrink-0 sm:justify-end">
          <p
            className={
              "whitespace-nowrap text-base font-bold " +
              (transaction.type === "INCOME" ? "text-primary" : "text-expense-ink")
            }
          >
            <span className="sr-only">{transaction.type === "INCOME" ? "הכנסה" : "הוצאה"}: </span>
            <span dir="ltr">{sign}{symbol}{safeAmount.toFixed(2)}</span>
          </p>

          <div className="flex items-center gap-1">
            <Dialog open={editing} onOpenChange={(open) => {
              if (submitting && !open) return;
              setEditing(open);
              if (open) setError(null);
            }}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={locked} className="gap-1.5 text-expense-ink">
                  <PencilIcon />
                  <span>עריכה</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>עריכת עסקה</DialogTitle>
                  <DialogDescription>עדכן את פרטי העסקה. השינויים יישמרו רק לאחר אישור.</DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`type-${transaction.id}`}>סוג</Label>
                    <Select name="type" defaultValue={transaction.type} disabled={locked || submitting}>
                      <SelectTrigger id={`type-${transaction.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EXPENSE">הוצאה</SelectItem>
                        <SelectItem value="INCOME">הכנסה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`amount-${transaction.id}`}>סכום</Label>
                    <Input id={`amount-${transaction.id}`} name="amount" type="number" step="0.01" min="0.01" required defaultValue={safeAmount} disabled={locked || submitting} />
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`currency-${transaction.id}`}>מטבע</Label>
                    <Select name="currency" defaultValue={transaction.currency} disabled={locked || submitting}>
                      <SelectTrigger id={`currency-${transaction.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ILS">₪ ILS</SelectItem>
                        <SelectItem value="USD">$ USD</SelectItem>
                        <SelectItem value="EUR">€ EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`category-${transaction.id}`}>קטגוריה</Label>
                    <Select name="categoryId" defaultValue={categoryId} disabled={locked || submitting}>
                      <SelectTrigger id={`category-${transaction.id}`}><SelectValue placeholder="בחר קטגוריה" /></SelectTrigger>
                      <SelectContent>
                        {editableCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="min-w-0 space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`note-${transaction.id}`}>הערה</Label>
                    <Input id={`note-${transaction.id}`} name="note" type="text" maxLength={500} defaultValue={transaction.note ?? ""} disabled={locked || submitting} />
                  </div>

                  {error && <p role="alert" className="m-0 text-sm text-critical sm:col-span-2">{error}</p>}

                  <DialogFooter className="sm:col-span-2">
                    <Button type="button" variant="outline" disabled={submitting} onClick={() => setEditing(false)}>ביטול</Button>
                    <Button
                      type="submit"
                      disabled={submitting || locked}
                      className="bg-expense-ink text-expense-foreground hover:bg-expense-ink/90"
                    >
                      {submitting ? "שומר..." : "שמירה"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={(open) => {
              if (deleting && !open) return;
              setDeleteOpen(open);
              if (open) setDeleteError(null);
            }}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="icon" disabled={locked} aria-label="מחיקה" className="text-muted hover:text-critical">
                  <TrashIcon />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>מחיקת עסקה</AlertDialogTitle>
                  <AlertDialogDescription>הפעולה תמחק את העסקה לצמיתות ולא ניתן יהיה לבטל אותה.</AlertDialogDescription>
                </AlertDialogHeader>
                {deleteError && <p role="alert" className="m-0 text-sm text-critical">{deleteError}</p>}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
                  <AlertDialogAction disabled={deleting || locked} onClick={handleDelete}>
                    {deleting ? "מוחק..." : "אישור מחיקה"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </article>
  );
}
