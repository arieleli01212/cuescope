import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { Plus } from "lucide-react";

import type { Category, TransactionType } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import { ToastStatus } from "./ui/toast";

export interface AddTransactionPayload {
  type: TransactionType;
  amount: number;
  currency: string;
  categoryId: string;
  note?: string;
}

interface AddTransactionTabProps {
  categories: Category[];
  onSubmit: (payload: AddTransactionPayload) => Promise<void>;
  onCreateCategory: (name: string) => Promise<Category>;
}

interface AddTransactionSheetProps extends AddTransactionTabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

interface AddTransactionFormProps extends AddTransactionTabProps {
  onPendingChange?: (pending: boolean) => void;
}

function AddTransactionForm({ categories, onSubmit, onCreateCategory, onPendingChange }: AddTransactionFormProps) {
  const amountId = useId();
  const currencyId = useId();
  const categoryIdAttribute = useId();
  const noteId = useId();
  const newCategoryId = useId();
  const submittingRef = useRef(false);
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryPending, setCategoryPending] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const availableCategories = useMemo(() => [
    ...categories,
    ...createdCategories.filter((created) => !categories.some((category) => category.id === created.id)),
  ], [categories, createdCategories]);

  useEffect(() => {
    setSelectedCategoryId((current) => (
      availableCategories.some((category) => category.id === current)
        ? current
        : availableCategories[0]?.id ?? ""
    ));
  }, [availableCategories]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || !selectedCategoryId) return;
    submittingRef.current = true;
    setSubmitting(true);
    onPendingChange?.(true);
    setStatus(null);
    try {
      await onSubmit({
        type,
        amount: Number.parseFloat(amount),
        currency,
        categoryId: selectedCategoryId,
        note: note.trim() || undefined,
      });
      setAmount("");
      setNote("");
      setStatus({ text: "העסקה נשמרה", ok: true });
    } catch (error) {
      setStatus({ text: error instanceof Error && error.message ? error.message : "שמירת העסקה נכשלה", ok: false });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onPendingChange?.(false);
    }
  }

  async function saveNewCategory() {
    const name = newCategoryName.trim();
    if (!name || categoryPending) return;
    setCategoryPending(true);
    onPendingChange?.(true);
    setCategoryError(null);
    try {
      const category = await onCreateCategory(name);
      setCreatedCategories((current) => (
        current.some((item) => item.id === category.id) ? current : [...current, category]
      ));
      setSelectedCategoryId(category.id);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (error) {
      setCategoryError(error instanceof Error && error.message ? error.message : "יצירת הקטגוריה נכשלה");
    } finally {
      setCategoryPending(false);
      onPendingChange?.(false);
    }
  }

  const locked = submitting || categoryPending;
  const selectedCategory = availableCategories.find((category) => category.id === selectedCategoryId);

  return (
    <form onSubmit={handleSubmit} className="mt-6 min-w-0 space-y-5">
      <fieldset disabled={locked} className="min-w-0 space-y-5 disabled:opacity-80">
        <legend className="sr-only">סוג עסקה</legend>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-bg/60 p-1">
          {(["EXPENSE", "INCOME"] as const).map((nextType) => {
            const selected = type === nextType;
            return (
              <Button
                key={nextType}
                type="button"
                variant="ghost"
                aria-pressed={selected}
                onClick={() => setType(nextType)}
                className={
                  "rounded-lg " +
                  (selected
                    ? nextType === "EXPENSE"
                      ? "bg-expense-ink text-expense-foreground hover:bg-expense-ink/90 hover:text-expense-foreground"
                      : "bg-primary text-primary-foreground hover:bg-primary-dark hover:text-primary-foreground"
                    : "text-muted")
                }
              >
                {nextType === "EXPENSE" ? "הוצאה" : "הכנסה"}
              </Button>
            );
          })}
        </div>

        <div className="space-y-2">
          <Label htmlFor={amountId}>סכום</Label>
          <Input
            id={amountId}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required
            autoFocus
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="h-16 min-w-0 text-center text-3xl font-semibold tracking-tight"
          />
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <div className="min-w-0 space-y-2">
            <Label htmlFor={categoryIdAttribute}>קטגוריה</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => {
                if (value) setSelectedCategoryId(value);
              }}
              disabled={locked}
            >
              <SelectTrigger id={categoryIdAttribute} aria-label="קטגוריה" className="min-w-0">
                <SelectValue placeholder="בחירת קטגוריה">{selectedCategory?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={currencyId}>מטבע</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={locked}>
              <SelectTrigger id={currencyId} aria-label="מטבע" className="min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ILS">₪ ILS</SelectItem>
                <SelectItem value="USD">$ USD</SelectItem>
                <SelectItem value="EUR">€ EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={noteId}>הערה (אופציונלי)</Label>
          <Input
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="לדוגמה: קניות שבועיות"
          />
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-bg/35 p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowNewCategory((current) => !current);
              setCategoryError(null);
            }}
            aria-expanded={showNewCategory}
            className="w-full justify-start gap-2 text-muted hover:text-text"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            קטגוריה חדשה
          </Button>
          {showNewCategory && (
            <div className="space-y-2">
              <Label htmlFor={newCategoryId}>שם קטגוריה חדשה</Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  id={newCategoryId}
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button type="button" variant="outline" onClick={saveNewCategory} disabled={locked || !newCategoryName.trim()}>
                  {categoryPending ? "שומר…" : "שמירת קטגוריה"}
                </Button>
              </div>
              {categoryError && <ToastStatus message={categoryError} variant="error" />}
            </div>
          )}
        </div>
      </fieldset>

      <Button
        type="submit"
        disabled={locked || !selectedCategoryId}
        className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary-dark"
      >
        {submitting ? "שומר…" : "שמירה"}
      </Button>
      <ToastStatus message={status?.text ?? null} variant={status?.ok ? "success" : "error"} />
    </form>
  );
}

export function AddTransactionTab(props: AddTransactionTabProps) {
  return (
    <Card className="premium-card mx-auto max-w-lg p-5 sm:p-6">
      <AddTransactionForm {...props} />
    </Card>
  );
}

export function AddTransactionSheet({
  open,
  onOpenChange,
  returnFocusRef,
  ...formProps
}: AddTransactionSheetProps) {
  const [pending, setPending] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && pending) return;
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        dismissible={!pending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef?.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>הוספת עסקה</SheetTitle>
          <SheetDescription>עדכון מהיר של התמונה הפיננסית שלך, בלי לעזוב את המסך.</SheetDescription>
        </SheetHeader>
        <AddTransactionForm {...formProps} onPendingChange={setPending} />
      </SheetContent>
    </Sheet>
  );
}
