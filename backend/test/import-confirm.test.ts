import assert from "node:assert/strict";
import test from "node:test";
import type { z } from "zod";

import { confirmImportSchema, importRowSchema } from "../src/dto/import.dto";
import {
  ImportRepository,
  ImportTransactionRepository,
  ImportTransactionRow,
  createImportService,
  prepareRows,
} from "../src/services/import.service";
import { AppError } from "../src/utils/AppError";

type ImportRow = z.infer<typeof importRowSchema>;

const CATEGORY = {
  explicit: "123e4567-e89b-42d3-a456-426614174001",
  history: "123e4567-e89b-42d3-a456-426614174002",
  fallback: "123e4567-e89b-42d3-a456-426614174003",
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

function transactionalRepository(options: {
  stored?: Set<string>;
  existingCategories?: Set<string>;
  history?: Array<{ merchantKey: string; categoryId: string }>;
  createCount?: number;
  createError?: Error;
  ownedBatchIds?: Set<string>;
} = {}) {
  const state = {
    batches: [] as Array<Record<string, unknown>>,
    transactions: [] as ImportTransactionRow[],
    updated: [] as Array<Record<string, unknown>>,
    deleted: [] as string[],
    transactionCalls: 0,
  };

  const reads: ImportRepository = {
    async findStoredFingerprints() {
      return options.stored ?? new Set();
    },
    async findRecentMerchantCategories() {
      return options.history ?? [];
    },
    async findExistingCategoryIds(categoryIds) {
      return options.existingCategories ?? new Set(categoryIds);
    },
    async resolveFallbackCategory() {
      return CATEGORY.fallback;
    },
  };

  const repository = {
    ...reads,
    async transaction<T>(work: (tx: ImportTransactionRepository) => Promise<T>): Promise<T> {
      state.transactionCalls += 1;
      const pending = {
        batches: [] as Array<Record<string, unknown>>,
        transactions: [] as ImportTransactionRow[],
        updated: [] as Array<Record<string, unknown>>,
        deleted: [] as string[],
      };
      const tx: ImportTransactionRepository = {
        ...reads,
        async createBatch(data) {
          pending.batches.push(data);
          return { id: "123e4567-e89b-42d3-a456-426614174099" };
        },
        async createTransactions(data) {
          pending.transactions.push(...data);
          if (options.createError) throw options.createError;
          return options.createCount ?? data.length;
        },
        async updateBatchCounts(id, userId, counts) {
          pending.updated.push({ id, userId, ...counts });
        },
        async deleteOwnedBatch(id, userId) {
          if (!(options.ownedBatchIds ?? new Set()).has(`${userId}:${id}`)) return false;
          pending.deleted.push(id);
          return true;
        },
      };

      const result = await work(tx);
      state.batches.push(...pending.batches);
      state.transactions.push(...pending.transactions);
      state.updated.push(...pending.updated);
      state.deleted.push(...pending.deleted);
      return result;
    },
  };
  return { repository, state };
}

test("confirm revalidates amounts, fingerprints, categories, and duplicate rows", async () => {
  const rows = [
    row({ merchant: "Stored", sourceReferenceHash: "1".repeat(64) }),
    row({ rowNumber: 2, merchant: "Payload duplicate", sourceReferenceHash: "2".repeat(64) }),
    row({ rowNumber: 3, merchant: "Payload duplicate", sourceReferenceHash: "2".repeat(64) }),
    row({ rowNumber: 4, merchant: "Bad currency", chargedCurrency: "USD", sourceReferenceHash: "3".repeat(64) }),
    row({ rowNumber: 5, merchant: "Missing category", sourceReferenceHash: "4".repeat(64) }),
    row({ rowNumber: 6, merchant: "History shop", sourceReferenceHash: "5".repeat(64) }),
  ];
  const stored = new Set([prepareRows("user-1", [rows[0]])[0].fingerprint]);
  const fake = transactionalRepository({
    stored,
    existingCategories: new Set(),
    history: [{ merchantKey: "history shop", categoryId: CATEGORY.history }],
  });

  const result = await createImportService(fake.repository, "ILS").confirm("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows,
    categoryMappings: { "missing category": CATEGORY.explicit },
    rejectedRows: [
      { rowNumber: 7, code: "UNSUPPORTED_ROW" },
      { rowNumber: 8, code: "INVALID_AMOUNT" },
    ],
  });

  assert.deepEqual(result, {
    id: "123e4567-e89b-42d3-a456-426614174099",
    adapter: "credit-card-xlsx-v1",
    importedCount: 2,
    skippedCount: 2,
    rejectedCount: 4,
  });
  assert.deepEqual(fake.state.transactions.map(({ merchant, categoryId }) => ({ merchant, categoryId })), [
    { merchant: "History shop", categoryId: CATEGORY.history },
    { merchant: "Payload duplicate", categoryId: CATEGORY.fallback },
  ]);
});

test("confirmation stores the exact statement and ownership fields with explicit mapping precedence", async () => {
  const fake = transactionalRepository({
    history: [{ merchantKey: "demo shop", categoryId: CATEGORY.history }],
  });
  const input = row({ merchant: "  Demo   Shop  ", amount: 10, chargedAmount: 37.53 });

  await createImportService(fake.repository, "ILS").confirm("user-1", confirmImportSchema.parse({
    adapter: "credit-card-xlsx-v1",
    rows: [input],
    categoryMappings: { "demo shop": CATEGORY.explicit },
    rejectedRows: [],
  }));

  const fingerprint = prepareRows("user-1", [{ ...input, merchant: "Demo   Shop" }])[0].fingerprint;
  assert.deepEqual(fake.state.transactions, [{
    type: "EXPENSE",
    amount: 10,
    currency: "USD",
    exchangeRate: 3.753,
    amountBase: 37.53,
    merchant: "Demo   Shop",
    merchantKey: "demo shop",
    occurredAt: new Date("2026-08-27T12:34:56.000Z"),
    categoryId: CATEGORY.explicit,
    userId: "user-1",
    importBatchId: "123e4567-e89b-42d3-a456-426614174099",
    sourceFingerprint: fingerprint,
  }]);
});

test("createMany race duplicates use skipDuplicates semantics and the actual inserted count", async () => {
  const fake = transactionalRepository({ createCount: 1 });

  const result = await createImportService(fake.repository, "ILS").confirm("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows: [row(), row({ rowNumber: 2, sourceReferenceHash: "b".repeat(64) })],
    categoryMappings: {},
    rejectedRows: [],
  });

  assert.equal(fake.state.transactions.length, 2, "all candidates reach one createMany call");
  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(fake.state.updated, [{
    id: result.id,
    userId: "user-1",
    importedCount: 1,
    skippedCount: 1,
    rejectedCount: 0,
  }]);
});

test("confirmation inserts candidates in deterministic fingerprint order", async () => {
  const fake = transactionalRepository();
  const rows = [
    row({ rowNumber: 1, merchant: "Zulu", sourceReferenceHash: "f".repeat(64) }),
    row({ rowNumber: 2, merchant: "Alpha", sourceReferenceHash: "0".repeat(64) }),
    row({ rowNumber: 3, merchant: "Middle", sourceReferenceHash: "7".repeat(64) }),
  ];

  await createImportService(fake.repository, "ILS").confirm("user-1", {
    adapter: "credit-card-xlsx-v1",
    rows,
    categoryMappings: {},
    rejectedRows: [],
  });

  const fingerprints = fake.state.transactions.map(({ sourceFingerprint }) => sourceFingerprint);
  assert.deepEqual(fingerprints, [...fingerprints].sort());
});

test("an unexpected transaction-row failure commits neither the batch nor rows", async () => {
  const fake = transactionalRepository({ createError: new Error("database unavailable") });

  await assert.rejects(
    createImportService(fake.repository, "ILS").confirm("user-1", {
      adapter: "credit-card-xlsx-v1",
      rows: [row()],
      categoryMappings: {},
      rejectedRows: [],
    }),
    /database unavailable/,
  );
  assert.equal(fake.state.transactionCalls, 1);
  assert.deepEqual(fake.state.batches, []);
  assert.deepEqual(fake.state.transactions, []);
  assert.deepEqual(fake.state.updated, []);
});

test("undo deletes only an owned batch inside a transaction", async () => {
  const id = "123e4567-e89b-42d3-a456-426614174099";
  const fake = transactionalRepository({ ownedBatchIds: new Set([`user-1:${id}`]) });
  const service = createImportService(fake.repository, "ILS");

  await service.undo("user-1", id);
  assert.deepEqual(fake.state.deleted, [id]);

  await assert.rejects(
    service.undo("user-2", id),
    (error: unknown) => error instanceof AppError
      && error.statusCode === 404
      && error.code === "NOT_FOUND"
      && error.message === "Import batch not found",
  );
});
