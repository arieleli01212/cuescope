import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { z } from "zod";

import { importRowSchema } from "../src/dto/import.dto";
import {
  ImportRepository,
  createImportService,
  prepareRows,
} from "../src/services/import.service";

type ImportRow = z.infer<typeof importRowSchema>;

const CATEGORY_IDS = {
  explicit: "123e4567-e89b-42d3-a456-426614174001",
  latest: "123e4567-e89b-42d3-a456-426614174002",
  old: "123e4567-e89b-42d3-a456-426614174003",
  fallback: "123e4567-e89b-42d3-a456-426614174004",
};

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 1,
    occurredAt: "2026-08-27T12:34:56.000Z",
    merchant: "Demo Shop",
    amount: 10,
    currency: "USD",
    chargedAmount: 37.5,
    chargedCurrency: "ILS",
    sourceReferenceHash: "a".repeat(64),
    ...overrides,
  };
}

function repository(overrides: Partial<ImportRepository> = {}) {
  const calls = {
    fingerprints: [] as string[][],
    categoryIds: [] as string[][],
    history: 0,
    fallback: 0,
  };
  const value: ImportRepository = {
    async findStoredFingerprints(_userId, fingerprints) {
      calls.fingerprints.push([...fingerprints]);
      return new Set();
    },
    async findRecentMerchantCategories() {
      calls.history += 1;
      return [];
    },
    async findExistingCategoryIds(categoryIds) {
      calls.categoryIds.push([...categoryIds]);
      return new Set(categoryIds);
    },
    async resolveFallbackCategory() {
      calls.fallback += 1;
      return CATEGORY_IDS.fallback;
    },
    ...overrides,
  };
  return { value, calls };
}

test("prepareRows identifies duplicate fingerprints inside one payload", () => {
  const prepared = prepareRows("user-1", [
    row(),
    row({ rowNumber: 2 }),
  ]);

  assert.equal(prepared[0].duplicateInPayload, false);
  assert.equal(prepared[1].duplicateInPayload, true);
  assert.equal(prepared[0].fingerprint, prepared[1].fingerprint);
  assert.equal(prepared[0].merchantKey, "demo shop");
});

test("preview reports stored and payload duplicates using one bulk fingerprint lookup", async () => {
  const rows = [
    row({ merchant: "Stored Shop", sourceReferenceHash: "a".repeat(64) }),
    row({ rowNumber: 2, merchant: "Importable Shop", sourceReferenceHash: "b".repeat(64) }),
    row({ rowNumber: 3, merchant: "Importable Shop", sourceReferenceHash: "b".repeat(64) }),
  ];
  const storedFingerprint = prepareRows("user-1", [rows[0]])[0].fingerprint;
  const fake = repository({
    async findStoredFingerprints(_userId, fingerprints) {
      fake.calls.fingerprints.push([...fingerprints]);
      return new Set([storedFingerprint]);
    },
  });

  const preview = await createImportService(fake.value, "ILS").preview("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows,
    categoryMappings: {},
  });

  assert.equal(fake.calls.fingerprints.length, 1);
  assert.equal(fake.calls.fingerprints[0].length, 2, "the IN lookup should contain unique fingerprints");
  assert.equal(preview.validCount, 1);
  assert.equal(preview.duplicateCount, 2);
  assert.equal(preview.rejected.length, 0);
  assert.deepEqual(preview.merchantGroups, [{
    key: "importable shop",
    displayName: "Importable Shop",
    rowCount: 1,
    suggestedCategoryId: CATEGORY_IDS.fallback,
    suggestionSource: "fallback",
  }]);
});

test("category suggestions prefer explicit mapping, then latest normalized history, then אחר", async () => {
  const fake = repository({
    async findRecentMerchantCategories() {
      fake.calls.history += 1;
      return [
        { merchant: "  KNOWN   shop ", categoryId: CATEGORY_IDS.latest },
        { merchant: "Known Shop", categoryId: CATEGORY_IDS.old },
      ];
    },
  });
  const preview = await createImportService(fake.value, "ILS").preview("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows: [
      row({ merchant: "Mapped Shop", sourceReferenceHash: "a".repeat(64) }),
      row({ rowNumber: 2, merchant: "known shop", sourceReferenceHash: "b".repeat(64) }),
      row({ rowNumber: 3, merchant: "New Shop", sourceReferenceHash: "c".repeat(64) }),
    ],
    categoryMappings: {
      "mapped shop": CATEGORY_IDS.old,
      "  MAPPED   SHOP ": CATEGORY_IDS.explicit,
    },
  });

  assert.deepEqual(
    preview.merchantGroups.map(({ key, suggestedCategoryId, suggestionSource }) => ({
      key,
      suggestedCategoryId,
      suggestionSource,
    })),
    [
      { key: "mapped shop", suggestedCategoryId: CATEGORY_IDS.explicit, suggestionSource: "explicit" },
      { key: "known shop", suggestedCategoryId: CATEGORY_IDS.latest, suggestionSource: "history" },
      { key: "new shop", suggestedCategoryId: CATEGORY_IDS.fallback, suggestionSource: "fallback" },
    ],
  );
  assert.equal(fake.calls.history, 1);
  assert.deepEqual(fake.calls.categoryIds, [[CATEGORY_IDS.old, CATEGORY_IDS.explicit]]);
  assert.equal(fake.calls.fallback, 1);
});

test("charged-currency rejection exposes only row number and a non-sensitive reason", async () => {
  const fake = repository();
  const preview = await createImportService(fake.value, "ILS").preview("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows: [row({ rowNumber: 17, merchant: "Private Merchant", amount: 1234.56, chargedCurrency: "USD" })],
    categoryMappings: {},
  });

  assert.equal(preview.validCount, 0);
  assert.equal(preview.duplicateCount, 0);
  assert.deepEqual(preview.rejected, [{
    rowNumber: 17,
    code: "CHARGED_CURRENCY_MISMATCH",
    message: "Charged currency does not match the configured base currency",
  }]);
  const serialized = JSON.stringify(preview.rejected);
  assert.doesNotMatch(serialized, /Private Merchant/);
  assert.doesNotMatch(serialized, /1234\.56/);
});

test("missing mapped categories reject affected rows without echoing row values", async () => {
  const fake = repository({
    async findExistingCategoryIds(categoryIds) {
      fake.calls.categoryIds.push([...categoryIds]);
      return new Set();
    },
  });
  const preview = await createImportService(fake.value, "ILS").preview("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows: [row({ rowNumber: 23, merchant: "Mapped Private Shop", amount: 987.65 })],
    categoryMappings: { "mapped private shop": CATEGORY_IDS.explicit },
  });

  assert.equal(preview.validCount, 0);
  assert.deepEqual(preview.rejected, [{
    rowNumber: 23,
    code: "INVALID_CATEGORY_MAPPING",
    message: "Mapped category does not exist",
  }]);
  assert.doesNotMatch(JSON.stringify(preview.rejected), /Mapped Private Shop|987\.65/);
  assert.equal(fake.calls.categoryIds.length, 1);
});

test("import router authenticates before its route-specific 8mb JSON parser", () => {
  const appSource = readFileSync(path.join(__dirname, "..", "src", "app.ts"), "utf8");
  const auth = appSource.indexOf("importApi.use(asyncHandler(authenticate))");
  const parser = appSource.indexOf('importApi.use(express.json({ limit: "8mb" }))');
  const routes = appSource.indexOf("importApi.use(importRoutes)");

  assert.notEqual(auth, -1);
  assert.notEqual(parser, -1);
  assert.notEqual(routes, -1);
  assert.ok(auth < parser, "authentication must run before parsing a large JSON request");
  assert.ok(parser < routes, "the scoped parser must run before import route handlers");
});
