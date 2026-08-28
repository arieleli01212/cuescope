import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { normalizedMerchantKey } from "../src/services/import-core";

const backendRoot = path.join(__dirname, "..");
const transactionServiceSource = readFileSync(
  path.join(backendRoot, "src", "services", "transaction.service.ts"),
  "utf8",
);
const transactionDtoSource = readFileSync(
  path.join(backendRoot, "src", "dto", "transaction.dto.ts"),
  "utf8",
);
const schema = readFileSync(path.join(backendRoot, "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(
    backendRoot,
    "prisma",
    "migrations",
    "20260827220000_add_transaction_merchant_key",
    "migration.sql",
  ),
  "utf8",
);

test("normalized merchant keys use import canonicalization and preserve null semantics", () => {
  assert.equal(normalizedMerchantKey("  Demo\t SHOP  "), "demo shop");
  assert.equal(normalizedMerchantKey(""), null);
  assert.equal(normalizedMerchantKey(" \t "), null);
  assert.equal(normalizedMerchantKey(null), null);
  assert.equal(normalizedMerchantKey(undefined), null);
});

test("transaction schema and migration persist and index normalized merchant keys", () => {
  assert.match(schema, /merchantKey\s+String\?/);
  assert.match(schema, /@@index\(\[userId,\s*merchantKey,\s*occurredAt\]\)/);
  assert.match(migration, /ADD COLUMN "merchantKey" TEXT/);
  assert.match(migration, /UPDATE "Transaction"[\s\S]*WHERE "merchant" IS NOT NULL/i);
  assert.match(
    migration,
    /TRANSLATE\(\s*"merchant",\s*'ABCDEFGHIJKLMNOPQRSTUVWXYZ',\s*'abcdefghijklmnopqrstuvwxyz'\s*\)/i,
  );
  assert.match(migration, /U&'\[\\0009-\\000D\\0020\]\+'/);
  assert.match(migration, /BTRIM\([\s\S]*,\s*' '\s*\)/i);
  assert.doesNotMatch(migration, /\b(?:NORMALIZE|LOWER)\s*\(|'\\s\+'/i);
  assert.match(
    migration,
    /CREATE INDEX "Transaction_userId_merchantKey_occurredAt_idx"\s+ON "Transaction"\("userId",\s*"merchantKey",\s*"occurredAt"\)/,
  );
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE/i);
});

test("normal transaction create and update synchronize merchant and merchantKey", () => {
  assert.match(
    transactionServiceSource,
    /merchant:\s*dto\.merchant,[\s\S]*merchantKey:\s*normalizedMerchantKey\(dto\.merchant\)/,
  );
  assert.match(
    transactionServiceSource,
    /dto\.merchant\s*!==\s*undefined[\s\S]*merchantKey:\s*normalizedMerchantKey\(dto\.merchant\)/,
  );

  const updateSchema = transactionDtoSource.slice(
    transactionDtoSource.indexOf("export const updateTransactionSchema"),
    transactionDtoSource.indexOf("export type UpdateTransactionDto"),
  );
  assert.match(
    updateSchema,
    /merchant:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(200\)\.nullable\(\)\.optional\(\)/,
  );
});
