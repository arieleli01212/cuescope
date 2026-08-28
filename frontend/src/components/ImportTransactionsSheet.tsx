import { useId, useMemo, useRef, useState } from "react";

import { creditCardXlsxAdapter } from "../import/creditCardXlsxAdapter";
import type { ParsedImportFile } from "../import/types";
import type {
  Category,
  ConfirmImportRequest,
  ImportPreview,
  ImportPreviewRequest,
  ImportResult,
} from "../types";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
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

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

type Stage = "select" | "parsing" | "preview" | "review" | "importing" | "result" | "error";

export interface ImportTransactionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onPreview: (payload: ImportPreviewRequest) => Promise<ImportPreview>;
  onConfirm: (payload: ConfirmImportRequest) => Promise<ImportResult>;
  onUndo: (batchId: string) => Promise<void>;
  onImported: () => Promise<void>;
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function ImportTransactionsForm({ categories, onPreview, onConfirm, onUndo, onImported }: Omit<ImportTransactionsSheetProps, "open" | "onOpenChange">) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("select");
  const [fileError, setFileError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [undoing, setUndoing] = useState(false);

  const fallbackCount = useMemo(
    () => preview?.merchantGroups.filter((group) => group.suggestionSource === "fallback").length ?? 0,
    [preview],
  );

  function reset() {
    setStage("select");
    setFileError(null);
    setErrorMessage(null);
    setParsedFile(null);
    setPreview(null);
    setCategoryMappings({});
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setFileError(null);
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("יש להעלות קובץ מסוג XLSX בלבד");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError("הקובץ חורג מהמגבלה של 5MB");
      return;
    }

    setStage("parsing");
    try {
      const parsed = await creditCardXlsxAdapter.parse(file);
      setParsedFile(parsed);

      if (parsed.rows.length === 0) {
        setPreview(null);
        setCategoryMappings({});
        setStage("preview");
        return;
      }

      const previewResult = await onPreview({
        adapter: parsed.adapter,
        rows: parsed.rows,
        categoryMappings: {},
      });
      setPreview(previewResult);
      setCategoryMappings(Object.fromEntries(
        previewResult.merchantGroups.map((group) => [group.key, group.suggestedCategoryId]),
      ));
      setStage("preview");
    } catch (error) {
      setStage("error");
      setErrorMessage(error instanceof Error && error.message ? error.message : "עיבוד הקובץ נכשל");
    }
  }

  async function handleConfirm() {
    if (!parsedFile) return;
    setStage("importing");
    try {
      const payload: ConfirmImportRequest = {
        adapter: parsedFile.adapter,
        rows: parsedFile.rows,
        categoryMappings,
        rejectedRows: parsedFile.rejected.map(({ rowNumber, code }) => ({ rowNumber, code })),
      };
      const confirmed = await onConfirm(payload);
      setResult(confirmed);
      setStage("result");
      await onImported();
    } catch (error) {
      setStage("error");
      setErrorMessage(error instanceof Error && error.message ? error.message : "הייבוא נכשל");
    }
  }

  async function handleUndo() {
    if (!result) return;
    setUndoing(true);
    try {
      await onUndo(result.id);
      await onImported();
      reset();
    } finally {
      setUndoing(false);
    }
  }

  const rejectedRows = [...(parsedFile?.rejected ?? []), ...(preview?.rejected ?? [])]
    .sort((left, right) => left.rowNumber - right.rowNumber);

  return (
    <div className="mt-6 min-w-0 space-y-5">
      {(stage === "select" || stage === "parsing") && (
        <div className="space-y-3">
          <label htmlFor={fileInputId} className="sr-only">בחירת קובץ ייבוא</label>
          <input
            ref={fileInputRef}
            id={fileInputId}
            aria-label="בחירת קובץ ייבוא"
            type="file"
            accept=".xlsx"
            disabled={stage === "parsing"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          {fileError && (
            <Alert variant="destructive">
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}
          {stage === "parsing" && (
            <p role="status" className="text-sm text-muted">מעבד את הקובץ…</p>
          )}
        </div>
      )}

      {(stage === "preview" || stage === "review" || stage === "importing") && parsedFile && (
        <div className="space-y-5">
          <Card className="p-4" role="region" aria-label="סיכום קובץ">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">שורות תקינות</dt>
                <dd className="font-semibold">{preview?.validCount ?? parsedFile.rows.length}</dd>
              </div>
              <div>
                <dt className="text-muted">כפילויות</dt>
                <dd className="font-semibold">{preview?.duplicateCount ?? 0}</dd>
              </div>
              {parsedFile.dateRange && (
                <div className="col-span-2">
                  <dt className="text-muted">טווח תאריכים</dt>
                  <dd className="font-semibold">
                    {new Date(parsedFile.dateRange.from).toLocaleDateString("he-IL")}
                    {" – "}
                    {new Date(parsedFile.dateRange.to).toLocaleDateString("he-IL")}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted">מטבעות</dt>
                <dd className="font-semibold">{parsedFile.currencies.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-muted">סה"כ לחיוב</dt>
                <dd className="font-semibold">{formatAmount(parsedFile.chargedTotal)}</dd>
              </div>
            </dl>
          </Card>

          {preview && preview.merchantGroups.length > 0 && (
            <div className="space-y-2">
              {fallbackCount > 0 && (
                <p className="text-sm text-muted">
                  {`${fallbackCount} בתי עסק ללא שיוך קודם, ישויכו ל"אחר"`}
                </p>
              )}
              <ul className="space-y-2">
                {preview.merchantGroups.map((group) => (
                  <li key={group.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{group.displayName}</p>
                      <p className="text-xs text-muted">{group.rowCount} עסקאות</p>
                    </div>
                    <Select
                      value={categoryMappings[group.key] ?? group.suggestedCategoryId}
                      onValueChange={(value) => {
                        if (value) setCategoryMappings((current) => ({ ...current, [group.key]: value }));
                      }}
                      disabled={stage !== "preview"}
                    >
                      <SelectTrigger aria-label={group.displayName} className="w-40 min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rejectedRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">שורות שנדחו</p>
              <ul aria-label="שורות שנדחו" className="space-y-1 text-sm text-muted">
                {rejectedRows.map((row) => (
                  <li key={row.rowNumber}>
                    <span>{`שורה ${row.rowNumber}`}</span>: <span>{row.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stage === "preview" && (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={reset}>ביטול</Button>
              <Button
                type="button"
                disabled={!preview || preview.validCount === 0}
                onClick={() => setStage("review")}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary-dark"
              >
                המשך
              </Button>
            </div>
          )}

          {(stage === "review" || stage === "importing") && (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={stage === "importing"} onClick={() => setStage("preview")}>
                חזרה
              </Button>
              <Button
                type="button"
                disabled={stage === "importing"}
                onClick={handleConfirm}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary-dark"
              >
                {stage === "importing" ? "מייבא…" : "אישור ייבוא"}
              </Button>
            </div>
          )}
        </div>
      )}

      {stage === "result" && result && (
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              {`יובאו ${result.importedCount} עסקאות, ${result.skippedCount} דולגו (כפילויות), ${result.rejectedCount} נדחו`}
            </AlertDescription>
          </Alert>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" disabled={undoing} onClick={handleUndo}>
              {undoing ? "מבטל…" : "ביטול הייבוא"}
            </Button>
            <Button type="button" onClick={reset} className="flex-1">סגירה</Button>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <Button type="button" onClick={reset}>נסה שוב</Button>
        </div>
      )}
    </div>
  );
}

export function ImportTransactionsSheet({ open, onOpenChange, ...formProps }: ImportTransactionsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>ייבוא קובץ</SheetTitle>
          <SheetDescription>ייבוא עסקאות מקובץ אקסל של כרטיס אשראי, בעיבוד מקומי בדפדפן בלבד.</SheetDescription>
        </SheetHeader>
        <ImportTransactionsForm {...formProps} />
      </SheetContent>
    </Sheet>
  );
}
