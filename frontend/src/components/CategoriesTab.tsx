import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";

import { groupCategories } from "../lib/dashboardHelpers";
import type { Category } from "../types";
import { TrashIcon } from "./icons";
import { Alert, AlertDescription } from "./ui/alert";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface CategoriesTabProps {
  categories: Category[];
  onUpdateGroup: (id: string, group: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreate: (name: string, group?: string) => Promise<unknown>;
}

function rejectionMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CategoriesTab({ categories, onUpdateGroup, onDelete, onCreate }: CategoriesTabProps) {
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const mountedRef = useRef(true);
  const savingIdsRef = useRef(new Set<string>());
  const savedTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const groups = useMemo(() => groupCategories(categories), [categories]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const timer of savedTimersRef.current.values()) clearTimeout(timer);
      savedTimersRef.current.clear();
    };
  }, []);

  async function handleUpdateGroup(id: string, group: string | null) {
    if (savingIdsRef.current.has(id)) return;
    savingIdsRef.current.add(id);

    const existingTimer = savedTimersRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    savedTimersRef.current.delete(id);
    setRowFeedback((current) => ({ ...current, [id]: { state: "saving", error: null } }));

    try {
      await onUpdateGroup(id, group);
      if (!mountedRef.current) return;
      setRowFeedback((current) => ({ ...current, [id]: { state: "saved", error: null } }));
      const timer = setTimeout(() => {
        if (!mountedRef.current) return;
        setRowFeedback((current) => ({ ...current, [id]: { state: "idle", error: null } }));
        savedTimersRef.current.delete(id);
      }, 1500);
      savedTimersRef.current.set(id, timer);
    } catch (err) {
      if (mountedRef.current) {
        setRowFeedback((current) => ({
          ...current,
          [id]: { state: "error", error: rejectionMessage(err, "שמירת הנושא נכשלה") },
        }));
      }
      throw err;
    } finally {
      savingIdsRef.current.delete(id);
    }
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name || adding) return;

    setAddError(null);
    setAdding(true);
    try {
      await onCreate(name, newGroup.trim() || undefined);
      if (mountedRef.current) {
        setNewName("");
        setNewGroup("");
      }
    } catch (err) {
      if (mountedRef.current) setAddError("שגיאה בהוספה: " + rejectionMessage(err, "יצירת הקטגוריה נכשלה"));
    } finally {
      if (mountedRef.current) setAdding(false);
    }
  }

  return (
    <section className="min-w-0 space-y-5" aria-labelledby="categories-title">
      <div className="premium-card relative overflow-hidden rounded-2xl border border-border px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-primary/10 to-transparent" aria-hidden="true" />
        <div className="relative max-w-2xl">
          <Badge variant="outline" className="mb-3 border-primary/30 bg-primary/10 text-primary">מבנה פיננסי חכם</Badge>
          <h1 id="categories-title" className="text-2xl font-bold tracking-tight sm:text-3xl">קטגוריות ונושאים</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">
            חבר קטגוריות לנושאים כדי לקבל תמונת הוצאות נקייה יותר. שינוי נושא נשמר אוטומטית ביציאה מהשדה.
          </p>
        </div>
      </div>

      <Card className="premium-card overflow-hidden">
        <CardHeader className="border-b border-border p-4 sm:p-5">
          <CardTitle className="text-lg">קטגוריה חדשה</CardTitle>
          <CardDescription>אפשר ליצור קטגוריה ללא נושא ולשייך אותה בהמשך.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={handleAdd} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="new-category-name">שם קטגוריה חדשה</Label>
              <Input
                id="new-category-name"
                value={newName}
                disabled={adding}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="למשל ביטוח"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="new-category-group">נושא לקטגוריה חדשה</Label>
              <Input
                id="new-category-group"
                value={newGroup}
                disabled={adding}
                onChange={(event) => setNewGroup(event.target.value)}
                placeholder="אופציונלי"
              />
            </div>
            <Button type="submit" disabled={adding || !newName.trim()} className="w-full sm:w-auto">
              {adding ? "מוסיף…" : "הוספת קטגוריה"}
            </Button>
          </form>
          {addError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription className="text-text">{addError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card className="premium-card border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted">עדיין אין קטגוריות. צור את הראשונה כדי להתחיל.</CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-2">
          {groups.map((group, groupIndex) => (
            <section key={group.key} aria-labelledby={`category-group-${groupIndex}`} className="min-w-0">
              <Card className="premium-card h-full min-w-0 overflow-hidden">
                <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border p-4 sm:p-5">
                  <h2 id={`category-group-${groupIndex}`} className="min-w-0 truncate text-lg font-semibold tracking-tight">
                    {group.name}
                  </h2>
                  <Badge variant="secondary" className="shrink-0">
                    {group.categories.length === 1 ? "קטגוריה אחת" : `${group.categories.length} קטגוריות`}
                  </Badge>
                </CardHeader>
                <CardContent className="divide-y divide-border p-0">
                  {group.categories.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      feedback={rowFeedback[category.id] ?? IDLE_FEEDBACK}
                      onUpdateGroup={handleUpdateGroup}
                      onDelete={onDelete}
                    />
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";
interface RowFeedback {
  state: SaveState;
  error: string | null;
}

const IDLE_FEEDBACK: RowFeedback = { state: "idle", error: null };

function CategoryRow({
  category,
  feedback,
  onUpdateGroup,
  onDelete,
}: {
  category: Category;
  feedback: RowFeedback;
  onUpdateGroup: (id: string, group: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const initialGroup = category.group?.trim() || "";
  const [group, setGroup] = useState(initialGroup);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const lastSavedGroupRef = useRef(initialGroup);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function commitGroup() {
    const nextGroup = group.trim();
    if (nextGroup === lastSavedGroupRef.current || feedback.state === "saving") return;

    try {
      await onUpdateGroup(category.id, nextGroup || null);
      if (!mountedRef.current) return;
      lastSavedGroupRef.current = nextGroup;
      setGroup(nextGroup);
    } catch {
      // The owner keeps the inline error visible for this category.
    }
  }

  async function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (deleting) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete(category.id);
      if (!mountedRef.current) return;
      setDeleting(false);
      setDeleteOpen(false);
    } catch (err) {
      if (!mountedRef.current) return;
      setDeleting(false);
      setDeleteError(rejectionMessage(err, "מחיקת הקטגוריה נכשלה"));
    }
  }

  return (
    <div className="min-w-0 p-4">
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end">
        <div className="min-w-0 self-center">
          <p className="truncate text-sm font-semibold text-text">{category.name}</p>
          <p className="mt-1 text-xs text-muted">שיוך בדוחות</p>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`category-group-input-${category.id}`}>נושא עבור {category.name}</Label>
          <Input
            id={`category-group-input-${category.id}`}
            value={group}
            disabled={feedback.state === "saving"}
            onChange={(event) => setGroup(event.target.value)}
            onBlur={commitGroup}
            placeholder="ללא נושא"
            className="min-w-0"
          />
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">
          <span className="text-xs">
            {feedback.state === "idle" && <span aria-hidden="true" className="text-muted">מוכן</span>}
            <span role="status" aria-live="polite" aria-atomic="true">
              {feedback.state === "saving" && <span className="text-muted">שומר…</span>}
              {feedback.state === "saved" && <span className="text-primary">נשמר</span>}
            </span>
          </span>

          <AlertDialog open={deleteOpen} onOpenChange={(open) => {
            if (deleting && !open) return;
            setDeleteOpen(open);
            if (open) setDeleteError(null);
          }}>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={`מחיקת ${category.name}`} className="shrink-0 text-muted hover:text-critical">
                <TrashIcon />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>מחיקת קטגוריה</AlertDialogTitle>
                <AlertDialogDescription>
                  למחוק את הקטגוריה „{category.name}”? ניתן למחוק רק קטגוריה שאין לה עסקאות משויכות.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-text">{deleteError}</AlertDescription>
                </Alert>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>ביטול</AlertDialogCancel>
                <AlertDialogAction disabled={deleting} onClick={handleDelete}>
                  {deleting ? "מוחק…" : "אישור מחיקה"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {feedback.error && (
        <Alert variant="destructive" className="mt-3 py-3">
          <AlertDescription className="text-text">{feedback.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
