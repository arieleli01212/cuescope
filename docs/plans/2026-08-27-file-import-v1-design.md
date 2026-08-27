# File Import v1 Design

## Goal

Let an authenticated CueScope user import the supplied Hebrew credit-card XLSX
statement format through the transaction UI, without uploading the raw workbook,
while preserving charged amounts, preventing duplicates, and allowing an entire
import batch to be undone.

## Scope

File Import v1 supports one adapter, `credit-card-xlsx-v1`. The adapter recognizes
the workbook by its eight column headers rather than its filename:

- `תאריך רכישה`
- `שם בית עסק`
- `סכום עסקה`
- `מטבע עסקה`
- `סכום חיוב`
- `מטבע חיוב`
- `מס' שובר`
- `פירוט נוסף`

The implementation defines an adapter interface so future XLSX, CSV, Israeli card
issuer, and Feezback adapters can reuse the same preview and confirmation flow.
Generic column mapping, multiple simultaneous files, complete import history, and
refund support are outside v1.

## User experience

The transactions screen gets an `ייבוא קובץ` action. The browser accepts one
`.xlsx` file up to 5 MB and parses at most 5,000 rows locally. The raw workbook is
never sent to the backend.

The flow is:

1. Select a workbook.
2. Detect and parse the adapter locally.
3. Show a preview with valid, rejected, and duplicate counts, date range,
   currencies, and total charged amount.
4. Group unknown merchants and let the user assign one category per merchant.
5. Show a final review containing the exact imported/skipped/rejected counts.
6. Confirm the normalized batch.
7. Show the result and an `Undo import` action for that batch.

Known merchants inherit the category of their most recent matching CueScope
transaction. An explicit mapping selected in the preview wins. Remaining unknown
merchants use the existing `אחר` category, with a visible count before confirmation.
The imported transactions belong to the currently authenticated user.

Unsupported rows are never silently dropped. The preview identifies them by source
row number and a non-sensitive reason.

## Browser parsing and privacy

The frontend uses the maintained MIT-licensed `read-excel-file` package. Its exact
version is locked. The adapter reads values but does not execute formulas.

The frontend validates extension, file size, adapter headers, row count, types,
dates, supported currencies, and numeric amounts. The voucher number participates
only in fingerprint creation and is then discarded. `פירוט נוסף`, the filename,
and the raw workbook are not persisted or logged.

Only normalized transaction candidates and explicit category mappings are sent to
the self-hosted CueScope API.

## Amount and currency semantics

For every supported positive charge:

- `amount` and `currency` come from the original transaction amount and currency.
- `amountBase` comes from the statement's charged amount.
- `exchangeRate` is `amountBase / amount` for foreign-currency purchases.
- ILS transactions normally use an exchange rate of `1`.

This records the historical charged amount instead of querying a current exchange
rate. Zero and negative rows are rejected in v1. Refunds need an explicit domain
model later and must not be misclassified as income.

## Deduplication

The backend computes the authoritative SHA-256 fingerprint from a canonical form of:

- authenticated user ID;
- adapter ID;
- purchase date;
- conservatively normalized merchant;
- original amount and currency;
- charged amount and currency;
- voucher number.

The database stores only the fingerprint. A nullable unique transaction field
prevents duplicates across overlapping statements and repeated submissions. The
preview reports currently known duplicates, but the confirmed import recalculates
fingerprints and checks uniqueness inside the database transaction to close races.

## Persistence and API

An `ImportBatch` records the owner, adapter ID, timestamp, and final imported,
skipped, and rejected counts. Imported transactions have nullable `importBatchId`
and `sourceFingerprint` fields. Existing transactions require no backfill beyond
nullable/default migration behavior.

Authenticated endpoints:

- `POST /v1/imports/preview` validates normalized candidates, suggests categories,
  and reports duplicates.
- `POST /v1/imports` repeats all validation and atomically creates the batch and
  non-duplicate transactions.
- `DELETE /v1/imports/:id` deletes the authenticated user's imported transactions
  and batch atomically.

Undo never removes existing categories. It is owner-scoped and cannot delete manual
transactions or another user's batch.

## Error handling and limits

Both browser and backend enforce 5,000 normalized rows. The API also enforces a
bounded JSON request size. Invalid adapter, malformed dates, unsupported currencies,
zero/negative amounts, inconsistent charged currency, and invalid category mappings
produce row-level rejection reasons. Authentication, ownership, and request-shape
failures use the existing API error envelope.

The confirmed import is atomic: an unexpected database or validation error commits
neither the batch nor any transaction. Expected duplicates and pre-reviewed rejected
rows do not abort valid rows; their final counts are recorded.

## Testing

All committed fixtures are synthetic. Tests cover:

- exact header detection and adapter rejection;
- ILS and foreign-currency parsing;
- statement summary/footer rows and malformed rows;
- deterministic canonical fingerprints;
- duplicates inside one payload, repeated files, and overlapping statements;
- category precedence and fallback;
- atomic import and owner-scoped undo;
- file validation, preview, mapping, confirmation, partial rejection, and undo UI;
- importing the same synthetic workbook twice.

After public tests pass, the two private statements supplied by Ariel are used only
for local acceptance through the private UI. They never become fixtures or leave the
self-hosted environment. Their deletion remains a separate explicit approval.

## Delivery

Work happens on `feat/file-import-v1` from public `main`, with small TDD commits. A
public PR must pass backend, frontend, and Compose checks plus review. Production is
unchanged until Ariel separately approves transferring the feature to the private
repository and deploying it.

