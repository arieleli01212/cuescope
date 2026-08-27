import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalMerchant,
  computeImportFingerprint,
  deriveStatementAmounts,
} from "../src/services/import-core";

test("canonicalMerchant normalizes case and whitespace conservatively", () => {
  assert.equal(canonicalMerchant("  Demo   SHOP  "), "demo shop");
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
