import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  const canonical = [
    "user-a",
    row.adapter,
    row.occurredAt,
    "demo shop",
    "10.00",
    row.currency,
    "37.50",
    row.chargedCurrency,
    row.sourceReferenceHash,
  ].join("\u001f");
  assert.equal(computeImportFingerprint("user-a", row), createHash("sha256").update(canonical).digest("hex"));
});

test("deriveStatementAmounts uses the configured deployment base currency", () => {
  for (const baseCurrency of ["ILS", "USD", "EUR"] as const) {
    assert.deepEqual(
      deriveStatementAmounts(
        { amount: 3, currency: "USD", chargedAmount: 10, chargedCurrency: baseCurrency },
        baseCurrency,
      ),
      { amount: 3, amountBase: 10, exchangeRate: 3.333333 },
    );
  }
});

test("deriveStatementAmounts rejects non-positive and mismatched base charges", () => {
  assert.throws(() =>
    deriveStatementAmounts({ amount: -1, currency: "ILS", chargedAmount: -1, chargedCurrency: "ILS" }, "ILS"),
  );
  assert.throws(() =>
    deriveStatementAmounts({ amount: 10, currency: "USD", chargedAmount: 9, chargedCurrency: "USD" }, "ILS"),
  );
});

test("import money rejects values with more than two fractional digits", () => {
  assert.throws(() =>
    deriveStatementAmounts({ amount: 10.001, currency: "USD", chargedAmount: 37.5, chargedCurrency: "ILS" }, "ILS"),
  );
  assert.throws(() =>
    deriveStatementAmounts({ amount: 10, currency: "USD", chargedAmount: 37.501, chargedCurrency: "ILS" }, "ILS"),
  );
  assert.throws(() =>
    computeImportFingerprint("user-a", {
      adapter: "credit-card-xlsx-v1",
      occurredAt: "2026-08-02",
      merchant: "Demo Shop",
      amount: 10.001,
      currency: "USD",
      chargedAmount: 37.5,
      chargedCurrency: "ILS",
      sourceReferenceHash: "a".repeat(64),
    }),
  );
});

test("deriveStatementAmounts rejects amount and charged amount overflow", () => {
  assert.throws(() =>
    deriveStatementAmounts(
      { amount: 10_000_000_000, currency: "USD", chargedAmount: 37.5, chargedCurrency: "ILS" },
      "ILS",
    ),
  );
  assert.throws(() =>
    deriveStatementAmounts(
      { amount: 10, currency: "USD", chargedAmount: 10_000_000_000, chargedCurrency: "ILS" },
      "ILS",
    ),
  );
});

test("deriveStatementAmounts rejects an exchange rate outside Decimal(12,6)", () => {
  assert.throws(() =>
    deriveStatementAmounts(
      { amount: 0.01, currency: "USD", chargedAmount: 10_000, chargedCurrency: "ILS" },
      "ILS",
    ),
  );
});
