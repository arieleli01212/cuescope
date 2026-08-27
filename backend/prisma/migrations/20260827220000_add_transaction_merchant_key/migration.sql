-- Add the lookup key as nullable so existing writes remain deploy-safe while
-- the historical rows are backfilled in place.
ALTER TABLE "Transaction"
ADD COLUMN "merchantKey" TEXT;

-- Match application canonicalization for stored merchant names: collapse all
-- whitespace, trim the result, lowercase it, and keep empty values nullable.
UPDATE "Transaction"
SET "merchantKey" = NULLIF(
    LOWER(BTRIM(REGEXP_REPLACE(NORMALIZE("merchant", NFKC), '\s+', ' ', 'g'))),
    ''
)
WHERE "merchant" IS NOT NULL;

-- Supports user-scoped merchant history ordered by transaction time.
CREATE INDEX "Transaction_userId_merchantKey_occurredAt_idx"
ON "Transaction"("userId", "merchantKey", "occurredAt");
