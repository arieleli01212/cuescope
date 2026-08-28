# File Import v1 Implementation Plan

> **For implementer:** Use TDD throughout. Write the failing test first. Watch it fail. Then implement.

**Goal:** Import the approved Hebrew credit-card XLSX format through a private, previewable, idempotent, undoable CueScope workflow.

**Architecture:** The browser parses XLSX files with a format adapter and sends normalized rows only. The backend validates again, computes canonical fingerprints, resolves categories, and persists an ImportBatch plus transactions atomically. The raw workbook, filename, voucher number, and extra-detail column are never stored or logged.

**Tech Stack:** React 18, TypeScript, read-excel-file 9.3.10, Express, Zod, Prisma/PostgreSQL, Node test runner through tsx, Vitest/Testing Library.

---

### Task 1: Enable executable backend TypeScript tests and add import primitives

**Files:**
- Modify: backend/package.json
- Create: backend/src/services/import-core.ts
- Create: backend/test/import-core.test.ts

**Step 1: Write the failing test**

Create backend/test/import-core.test.ts with Node test cases for:

~~~ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalMerchant,
  computeImportFingerprint,
  deriveStatementAmounts,
} from "../src/services/import-core";

test("canonicalMerchant normalizes ASCII case and whitespace conservatively", () => {
  assert.equal(canonicalMerchant("  Demo\t SHOP  "), "demo shop");
  assert.equal(canonicalMerchant("  ΟΣ İ  "), "ΟΣ İ");
});

test("computeImportFingerprint is stable and changes across users", () => {
  const row = {
    adapter: "credit-card-xlsx-v1",
    occurredAt: "2026-08-02",
    merchant: "Demo Shop",
    amount: 10,
    currency: "USD" as const,
    chargedAmount: 37.5,
    chargedCurrency: "ILS" as const,
    sourceReferenceHash: "a".repeat(64),
  };
  assert.equal(computeImportFingerprint("user-a", row), computeImportFingerprint("user-a", row));
  assert.notEqual(computeImportFingerprint("user-a", row), computeImportFingerprint("user-b", row));
});

test("deriveStatementAmounts preserves the charged base amount", () => {
  assert.deepEqual(
    deriveStatementAmounts({ amount: 10, currency: "USD", chargedAmount: 37.5, chargedCurrency: "ILS" }),
    { amount: 10, amountBase: 37.5, exchangeRate: 3.75 },
  );
});

test("deriveStatementAmounts rejects non-positive and mismatched base charges", () => {
  assert.throws(() =>
    deriveStatementAmounts({ amount: -1, currency: "ILS", chargedAmount: -1, chargedCurrency: "ILS" }),
  );
  assert.throws(() =>
    deriveStatementAmounts({ amount: 10, currency: "USD", chargedAmount: 9, chargedCurrency: "USD" }),
  );
});
~~~

Change backend/package.json test script to:

~~~json
"test": "tsx --test test/*.test.js test/*.test.ts"
~~~

**Step 2: Run test — confirm it fails**

Command: cd backend && npm test

Expected: FAIL because ../src/services/import-core does not exist.

**Step 3: Write minimal implementation**

Create backend/src/services/import-core.ts with:

~~~ts
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
  return value
    .replace(/[A-Z]/g, (character) => String.fromCharCode(character.charCodeAt(0) + 32))
    .replace(/[\u0009-\u000D\u0020]+/g, " ")
    .replace(/^ | $/g, "");
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
~~~

**Step 4: Run test — confirm it passes**

Command: cd backend && npm test && npm run build

Expected: all old and new backend tests PASS; TypeScript build PASS.

**Step 5: Commit**

Commit: test: add executable import core tests

---

### Task 2: Add ImportBatch persistence and validated import DTOs

**Files:**
- Modify: backend/prisma/schema.prisma
- Create: backend/prisma/migrations/20260827210000_add_import_batches/migration.sql
- Create: backend/src/dto/import.dto.ts
- Create: backend/test/import-dto.test.ts

**Step 1: Write the failing test**

Test preview/import schemas with valid rows, a 5,001-row rejection, invalid hash, negative amount, unknown adapter, invalid category IDs, and a UUID import ID.

The canonical row schema must contain:

~~~ts
{
  rowNumber: positive integer <= 5000,
  occurredAt: ISO datetime,
  merchant: trimmed string length 1..200,
  amount: positive finite number,
  currency: ILS | USD | EUR,
  chargedAmount: positive finite number,
  chargedCurrency: ILS | USD | EUR,
  sourceReferenceHash: 64 lowercase hexadecimal characters
}
~~~

**Step 2: Run test — confirm it fails**

Command: cd backend && npm test

Expected: FAIL because import.dto.ts does not exist.

**Step 3: Write minimal implementation**

Add Prisma models and relations:

~~~prisma
model User {
  // existing fields...
  importBatches ImportBatch[]
}

model Transaction {
  // existing fields...
  sourceFingerprint String?      @unique
  importBatchId     String?
  importBatch       ImportBatch? @relation(fields: [importBatchId], references: [id], onDelete: Cascade)

  @@index([importBatchId])
}

model ImportBatch {
  id            String        @id @default(uuid())
  adapter       String
  importedCount Int
  skippedCount  Int
  rejectedCount Int
  createdAt     DateTime      @default(now())
  userId        String
  user          User          @relation(fields: [userId], references: [id])
  transactions  Transaction[]

  @@index([userId, createdAt])
}
~~~

Create matching SQL with nullable transaction columns, foreign key with ON DELETE CASCADE,
unique sourceFingerprint index, importBatchId index, and user/time batch index.

Create Zod schemas:

~~~ts
const currencySchema = z.enum(["ILS", "USD", "EUR"]);
export const importRowSchema = z.object({
  rowNumber: z.number().int().min(1).max(5000),
  occurredAt: z.string().datetime(),
  merchant: z.string().trim().min(1).max(200),
  amount: z.number().finite().positive(),
  currency: currencySchema,
  chargedAmount: z.number().finite().positive(),
  chargedCurrency: currencySchema,
  sourceReferenceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

const payloadBase = z.object({
  adapter: z.literal("credit-card-xlsx-v1"),
  rows: z.array(importRowSchema).max(5000),
  categoryMappings: z.record(z.string().min(1), z.string().uuid()).default({}),
});

export const previewImportSchema = payloadBase;

const rejectedRowSchema = z.object({
  rowNumber: z.number().int().min(1).max(5000),
  code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
}).strict();

export const confirmImportSchema = payloadBase.extend({
  rejectedRows: z.array(rejectedRowSchema).max(5000).default([]),
}).strict().superRefine((payload, context) => {
  if (payload.rows.length + payload.rejectedRows.length > 5000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["rejectedRows"],
      message: "Combined row count must not exceed 5000",
    });
  }

  const validRowNumbers = new Set(payload.rows.map(({ rowNumber }) => rowNumber));
  const rejectedRowNumbers = new Set<number>();
  for (const [index, rejectedRow] of payload.rejectedRows.entries()) {
    if (rejectedRowNumbers.has(rejectedRow.rowNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedRows", index, "rowNumber"],
        message: "Rejected row numbers must be unique",
      });
    }
    if (validRowNumbers.has(rejectedRow.rowNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectedRows", index, "rowNumber"],
        message: "Rejected row numbers must not identify valid rows",
      });
    }
    rejectedRowNumbers.add(rejectedRow.rowNumber);
  }
});
export const importIdParamsSchema = z.object({ id: z.string().uuid() });
~~~

**Step 4: Verify migration and tests**

Commands:

- cd backend && npm run prisma:generate
- cd backend && npm test
- cd backend && npm run build

Expected: Prisma generation, all tests, and build PASS.

**Step 5: Commit**

Commit: feat: add import batch persistence

---

### Task 3: Implement preview, category suggestions, and duplicate reporting

**Files:**
- Create: backend/src/services/import.service.ts
- Create: backend/src/controllers/import.controller.ts
- Create: backend/src/routes/import.routes.ts
- Modify: backend/src/app.ts
- Create: backend/test/import-preview.test.ts

**Step 1: Write failing service tests**

Use dependency injection around a small ImportRepository interface so tests do not require PostgreSQL.
Cover:

- duplicate fingerprints already in storage;
- duplicate rows inside the same payload;
- explicit category mapping precedence;
- latest normalized merchant category suggestion;
- fallback to the existing/created אחר category;
- charged currency mismatch rejection;
- row-level error contains rowNumber and code, not merchant or amount.

Define the result shape:

~~~ts
interface ImportPreview {
  adapter: "credit-card-xlsx-v1";
  validCount: number;
  duplicateCount: number;
  rejected: Array<{ rowNumber: number; code: string; message: string }>;
  merchantGroups: Array<{
    key: string;
    displayName: string;
    rowCount: number;
    suggestedCategoryId: string;
    suggestionSource: "explicit" | "history" | "fallback";
  }>;
}
~~~

**Step 2: Run test — confirm it fails**

Command: cd backend && npm test

Expected: FAIL because import.service.ts does not exist.

**Step 3: Implement preview**

Implement pure preparation first:

~~~ts
export function prepareRows(userId: string, rows: ImportRow[]) {
  const seen = new Set<string>();
  return rows.map((row) => {
    const fingerprint = computeImportFingerprint(userId, {
      adapter: IMPORT_ADAPTER,
      ...row,
    });
    const duplicateInPayload = seen.has(fingerprint);
    seen.add(fingerprint);
    return {
      row,
      fingerprint,
      merchantKey: canonicalMerchant(row.merchant),
      duplicateInPayload,
    };
  });
}
~~~

The Prisma repository adapter must query existing fingerprints in one in-clause, load
recent categorized merchants once, validate all mapped category UUIDs in one query,
and resolve/create אחר once.

Add controller and route:

~~~ts
router.post(
  "/preview",
  validate({ body: previewImportSchema }),
  asyncHandler(importController.preview),
);
~~~

Mount after authentication:

~~~ts
app.use("/v1/imports", asyncHandler(authenticate), importRoutes);
~~~

**Step 4: Run tests/build**

Command: cd backend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: preview normalized transaction imports

---

### Task 4: Implement atomic confirmation and owner-scoped undo

**Files:**
- Modify: backend/src/services/import.service.ts
- Modify: backend/src/controllers/import.controller.ts
- Modify: backend/src/routes/import.routes.ts
- Create: backend/test/import-confirm.test.ts

**Step 1: Write failing tests**

Cover:

- confirm repeats fingerprint/category/amount validation;
- confirm accepts only privacy-safe `{ rowNumber, code }` client rejection metadata,
  derives its count server-side, and enforces the shared 5,000-row limit;
- createMany uses skipDuplicates and reports race duplicates from result.count;
- overlapping concurrent confirmations with reversed fingerprint order do not deadlock;
- imported amounts use statement amountBase and derived exchangeRate;
- category mappings override merchant history;
- unexpected create failure rolls back batch and rows;
- undo deletes an owned batch;
- undo returns not found for another user's batch;
- deleting a batch cascades only its imported transactions.

**Step 2: Run tests — confirm failure**

Command: cd backend && npm test

Expected: FAIL because confirm/undo are absent.

**Step 3: Implement confirmation and undo**

Within one Prisma interactive transaction:

1. Re-run preparation and category validation.
2. Remove duplicates already stored and duplicates inside the payload.
3. Create ImportBatch with temporary zero imported count.
4. Sort transaction rows by `sourceFingerprint`, then createMany with skipDuplicates.
5. Update counts using the actual createMany count.
6. Return batch ID and final counts.

The final rejected count is `rejectedRows.length` plus confirmation-time server
rejections. Client rejection metadata never includes merchant, amount, or a free-form
message. Deterministic fingerprint ordering ensures concurrent overlapping
confirmations acquire unique-index conflicts in the same order.

Each transaction stores:

~~~ts
{
  type: "EXPENSE",
  amount,
  currency,
  exchangeRate,
  amountBase,
  merchant: row.merchant.trim(),
  occurredAt: new Date(row.occurredAt),
  categoryId,
  userId,
  importBatchId: batch.id,
  sourceFingerprint: fingerprint
}
~~~

Routes:

~~~ts
router.post("/", validate({ body: confirmImportSchema }), asyncHandler(importController.confirm));
router.delete(
  "/:id",
  validate({ params: importIdParamsSchema }),
  asyncHandler(importController.undo),
);
~~~

**Step 4: Run tests/build**

Command: cd backend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: confirm and undo transaction imports

---

### Task 5: Add the browser XLSX adapter with synthetic tests

**Files:**
- Modify: frontend/package.json
- Modify: frontend/package-lock.json
- Create: frontend/src/import/types.ts
- Create: frontend/src/import/creditCardXlsxAdapter.ts
- Create: frontend/src/test/credit-card-xlsx-adapter.test.ts
- Create: frontend/src/test/fixtures/credit-card-statement.synthetic.xlsx

**Step 1: Install the parser**

Command: cd frontend && npm install read-excel-file@9.3.10 --save-exact

Expected: package and lockfile change only; npm audit reports zero known vulnerabilities.

**Step 2: Write failing adapter tests**

The synthetic workbook contains fake merchants only and covers:

- preamble before the exact eight-header row;
- ILS and USD purchases;
- an overlapping boundary transaction;
- a summary/footer row;
- malformed date;
- zero/negative row;
- unknown currency.

Tests assert format detection, row numbers, parsed ISO dates, original/charged values,
rejection codes, no extra-detail output, and no raw voucher output.

**Step 3: Run test — confirm failure**

Command: cd frontend && npm run test:components -- credit-card-xlsx-adapter.test.ts

Expected: FAIL because adapter is absent.

**Step 4: Implement adapter**

Define:

~~~ts
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

export interface ParsedImportFile {
  adapter: "credit-card-xlsx-v1";
  rows: ParsedImportRow[];
  rejected: Array<{ rowNumber: number; code: string; message: string }>;
  dateRange: { from: string; to: string } | null;
  currencies: Currency[];
  chargedTotal: number;
}
~~~

Use readXlsxFile(file), scan for the exact header sequence, cap at 5,000 data rows,
parse DD/MM/YYYY and Excel Date values to UTC ISO, map supported currency labels,
and hash the voucher locally with crypto.subtle.digest. Reject but do not emit raw
values for unsupported rows.

**Step 5: Run tests/build/audit**

Commands:

- cd frontend && npm test
- cd frontend && npm run build
- cd frontend && npm audit --audit-level=high

Expected: PASS and zero high/critical vulnerabilities.

**Step 6: Commit**

Commit: feat: parse credit card statements locally

---

### Task 6: Build the import preview and mapping sheet

**Files:**
- Create: frontend/src/components/ImportTransactionsSheet.tsx
- Create: frontend/src/test/import-transactions-sheet.test.tsx
- Modify: frontend/src/types.ts

**Step 1: Write failing component tests**

Cover:

- accessible dialog opens and file input accepts only XLSX;
- oversize and unsupported format errors;
- parsing loading state;
- preview summary counts/date range/currencies/charged total;
- unknown merchants are grouped once;
- category select defaults to server suggestion;
- unmapped fallback count is visible;
- import button is disabled while parsing/confirming;
- rejected rows show row number and reason only;
- final review requires explicit confirmation.

Mock the adapter and API callbacks; never load a real statement fixture in component tests.

**Step 2: Run focused test — confirm failure**

Command: cd frontend && npx vitest run src/test/import-transactions-sheet.test.tsx

Expected: FAIL because component is absent.

**Step 3: Implement component**

Props:

~~~ts
interface ImportTransactionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onPreview: (payload: ImportPreviewRequest) => Promise<ImportPreview>;
  onConfirm: (payload: ConfirmImportRequest) => Promise<ImportResult>;
  onUndo: (batchId: string) => Promise<void>;
  onImported: () => Promise<void>;
}
~~~

Implement explicit state stages: select, parsing, preview, review, importing, result,
error. Keep parsed rows only in component memory and clear them when the sheet closes.
Use existing Sheet, Button, Select, Alert, and Card primitives.

**Step 4: Run tests/build**

Command: cd frontend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: add transaction import preview

---

### Task 7: Integrate import actions into Transactions and App

**Files:**
- Modify: frontend/src/api.ts
- Modify: frontend/src/App.tsx
- Modify: frontend/src/components/TransactionsTab.tsx
- Modify: frontend/src/test/transactions-tab.test.tsx
- Modify: frontend/src/test/shell.test.tsx

**Step 1: Write failing integration tests**

Cover:

- Transactions header has an accessible ייבוא קובץ button;
- clicking opens the import sheet;
- preview posts normalized JSON to /imports/preview;
- confirm posts to /imports;
- success refreshes transactions, summary, and categories;
- undo calls DELETE /imports/:id and refreshes again;
- unauthorized import returns to login via existing callApi behavior.

**Step 2: Run tests — confirm failure**

Command: cd frontend && npm run test:components

Expected: FAIL because button and integration do not exist.

**Step 3: Implement integration**

Add an onImportClick prop to TransactionsTab and place the button beside the title/count.
Keep sheet ownership in App so it can call the existing authenticated API wrapper and
refresh all affected views.

Use:

~~~ts
const previewImport = (payload: ImportPreviewRequest) =>
  callApi<ImportPreview>("/imports/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const confirmImport = (payload: ConfirmImportRequest) =>
  callApi<ImportResult>("/imports", {
    method: "POST",
    body: JSON.stringify(payload),
  });

const undoImport = (batchId: string) =>
  callApi("/imports/" + batchId, { method: "DELETE" });
~~~

After confirm/undo, refresh categories, list month, and summary month with Promise.allSettled.

**Step 4: Run full frontend verification**

Command: cd frontend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: integrate file imports into transactions

---

### Task 8: Documentation, full verification, and public PR

**Files:**
- Modify: README.md
- Modify: docs/roadmap.md
- Modify: SECURITY.md

**Step 1: Write documentation assertions**

Update README and roadmap so XLSX import is marked shipped, supported format/limits are
explicit, and open-banking adapters remain planned. SECURITY.md must warn users not to
attach real statements to public issues and explain that raw files are parsed locally.

**Step 2: Run repository verification**

Commands:

- cd backend && npm ci && npm run prisma:generate && npm test && npm run build
- cd frontend && npm ci && npm test && npm run build && npm audit --audit-level=high
- POSTGRES_PASSWORD=ci-only-placeholder docker compose config --quiet
- git diff --check
- scan tracked files for real merchant names, voucher numbers, statement filenames, and inbound media paths

Expected: all green; scan finds no private statement data.

**Step 3: Review**

Run spec review, then code-quality review. Fix every accepted finding with a new test
where behavior changes. Re-run full verification.

**Step 4: Push and PR**

Push feat/file-import-v1 and open a public PR describing privacy boundaries, migration,
test evidence, and rollout separation. Wait for backend-ci, frontend-ci, and compose-config.

**Step 5: Commit**

Final documentation commit: docs: document local statement imports

Do not merge or deploy to the private production repository without Ariel's separate approval.
