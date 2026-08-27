import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmImportSchema,
  importIdParamsSchema,
  importRowSchema,
  previewImportSchema,
} from "../src/dto/import.dto";

const validRow = {
  rowNumber: 1,
  occurredAt: "2026-08-27T12:34:56.000Z",
  merchant: " Demo Shop ",
  amount: 10,
  currency: "USD",
  chargedAmount: 37.5,
  chargedCurrency: "ILS",
  sourceReferenceHash: "a".repeat(64),
};

const validPayload = {
  adapter: "credit-card-xlsx-v1",
  rows: [validRow],
  categoryMappings: {
    "demo shop": "123e4567-e89b-42d3-a456-426614174000",
  },
};

test("import row accepts the canonical shape and trims merchant", () => {
  const result = importRowSchema.parse(validRow);
  assert.equal(result.merchant, "Demo Shop");
});

test("preview and confirm require one to 5,000 rows", () => {
  assert.equal(previewImportSchema.parse(validPayload).rows.length, 1);
  assert.equal(confirmImportSchema.parse(validPayload).rejectedCount, 0);
  assert.equal(previewImportSchema.safeParse({ ...validPayload, rows: [] }).success, false);
  assert.equal(confirmImportSchema.safeParse({ ...validPayload, rows: [] }).success, false);
  assert.equal(
    previewImportSchema.safeParse({ ...validPayload, rows: Array.from({ length: 5_001 }, () => validRow) })
      .success,
    false,
  );
});

test("row validation rejects invalid hashes, amounts, dates, row numbers, and currencies", () => {
  const invalidRows = [
    { ...validRow, sourceReferenceHash: "A".repeat(64) },
    { ...validRow, sourceReferenceHash: "a".repeat(63) },
    { ...validRow, amount: -1 },
    { ...validRow, chargedAmount: Number.POSITIVE_INFINITY },
    { ...validRow, occurredAt: "2026-08-27" },
    { ...validRow, rowNumber: 0 },
    { ...validRow, rowNumber: 5_001 },
    { ...validRow, currency: "GBP" },
  ];

  for (const row of invalidRows) {
    assert.equal(importRowSchema.safeParse(row).success, false);
  }
});

test("payload accepts only the supported adapter and UUID category mappings", () => {
  assert.equal(
    previewImportSchema.safeParse({ ...validPayload, adapter: "unknown-adapter" }).success,
    false,
  );
  assert.equal(
    previewImportSchema.safeParse({ ...validPayload, categoryMappings: { "demo shop": "not-a-uuid" } })
      .success,
    false,
  );
  assert.equal(
    previewImportSchema.safeParse({
      ...validPayload,
      categoryMappings: { "": validPayload.categoryMappings["demo shop"] },
    }).success,
    false,
  );
});

test("import ID params require a UUID", () => {
  assert.deepEqual(importIdParamsSchema.parse({ id: "123e4567-e89b-42d3-a456-426614174000" }), {
    id: "123e4567-e89b-42d3-a456-426614174000",
  });
  assert.equal(importIdParamsSchema.safeParse({ id: "batch-1" }).success, false);
});
