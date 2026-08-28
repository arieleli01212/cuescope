-- Add the lookup key as nullable so existing writes remain deploy-safe while
-- the historical rows are backfilled in place.
ALTER TABLE "Transaction"
ADD COLUMN "merchantKey" TEXT;

-- Match application canonicalization exactly: lowercase ASCII A-Z, collapse and
-- trim only ASCII whitespace U+0009..U+000D and U+0020, preserve every other
-- code point unchanged, and keep empty values nullable.
UPDATE "Transaction"
SET "merchantKey" = NULLIF(
    BTRIM(
        REGEXP_REPLACE(
            TRANSLATE(
                "merchant",
                'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
                'abcdefghijklmnopqrstuvwxyz'
            ),
            U&'[\0009-\000D\0020]+',
            ' ',
            'g'
        ),
        ' '
    ),
    ''
)
WHERE "merchant" IS NOT NULL;

-- Supports user-scoped merchant history ordered by transaction time.
CREATE INDEX "Transaction_userId_merchantKey_occurredAt_idx"
ON "Transaction"("userId", "merchantKey", "occurredAt");
