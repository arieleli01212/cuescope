import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { TestContext } from "node:test";

import { PrismaClient } from "@prisma/client";

import { createImportService, createPrismaImportRepository } from "../src/services/import.service";
import { AppError } from "../src/utils/AppError";

const testDatabaseUrl = process.env.IMPORT_CONFIRM_TEST_DATABASE_URL;

async function connectedClient(t: TestContext): Promise<PrismaClient | undefined> {
  if (!testDatabaseUrl) {
    t.skip("IMPORT_CONFIRM_TEST_DATABASE_URL is not set");
    return undefined;
  }
  const client = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  try {
    const [{ transactionTable, batchTable }] = await client.$queryRaw<
      Array<{ transactionTable: string | null; batchTable: string | null }>
    >`SELECT to_regclass('"Transaction"')::text AS "transactionTable",
             to_regclass('"ImportBatch"')::text AS "batchTable"`;
    if (!transactionTable || !batchTable) {
      t.skip("PostgreSQL test database does not have the current Prisma migrations");
      await client.$disconnect();
      return undefined;
    }
    return client;
  } catch (error) {
    t.skip(`PostgreSQL test database is unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
    await client.$disconnect();
    return undefined;
  }
}

function payload(categoryId: string, reference: string) {
  return {
    adapter: "credit-card-xlsx-v1" as const,
    rows: [{
      rowNumber: 1,
      occurredAt: "2026-08-27T12:34:56.000Z",
      merchant: "Synthetic Integration Merchant",
      amount: 10,
      currency: "USD" as const,
      chargedAmount: 37.5,
      chargedCurrency: "ILS" as const,
      sourceReferenceHash: reference.repeat(64),
    }],
    categoryMappings: { "synthetic integration merchant": categoryId },
    rejectedCount: 0,
  };
}

async function fixture(client: PrismaClient) {
  const suffix = randomUUID();
  const [owner, other, category] = await Promise.all([
    client.user.create({ data: { name: `task4-owner-${suffix}`, apiKey: `task4-owner-key-${suffix}` } }),
    client.user.create({ data: { name: `task4-other-${suffix}`, apiKey: `task4-other-key-${suffix}` } }),
    client.category.create({ data: { name: `task4-category-${suffix}` } }),
  ]);
  return { owner, other, category };
}

async function cleanup(client: PrismaClient, userIds: string[], categoryId: string) {
  await client.importBatch.deleteMany({ where: { userId: { in: userIds } } });
  await client.transaction.deleteMany({ where: { userId: { in: userIds } } });
  await client.user.deleteMany({ where: { id: { in: userIds } } });
  await client.category.deleteMany({ where: { id: categoryId } });
}

test("PostgreSQL race duplicates use the actual createMany count", async (t) => {
  const client = await connectedClient(t);
  if (!client) return;
  const { owner, other, category } = await fixture(client);
  try {
    const service = createImportService(createPrismaImportRepository(client), "ILS");
    const results = await Promise.all([
      service.confirm(owner.id, payload(category.id, "a")),
      service.confirm(owner.id, payload(category.id, "a")),
    ]);

    assert.equal(results.reduce((sum, result) => sum + result.importedCount, 0), 1);
    assert.equal(results.reduce((sum, result) => sum + result.skippedCount, 0), 1);
    assert.equal(await client.transaction.count({ where: { userId: owner.id } }), 1);
    const batches = await client.importBatch.findMany({ where: { userId: owner.id } });
    assert.deepEqual(batches.map(({ importedCount }) => importedCount).sort(), [0, 1]);
    assert.deepEqual(batches.map(({ skippedCount }) => skippedCount).sort(), [0, 1]);
  } finally {
    await cleanup(client, [owner.id, other.id], category.id);
    await client.$disconnect();
  }
});

test("PostgreSQL undo is owner-scoped and cascades only the selected batch", async (t) => {
  const client = await connectedClient(t);
  if (!client) return;
  const { owner, other, category } = await fixture(client);
  try {
    const service = createImportService(createPrismaImportRepository(client), "ILS");
    const first = await service.confirm(owner.id, payload(category.id, "b"));
    const second = await service.confirm(owner.id, payload(category.id, "c"));

    await assert.rejects(
      service.undo(other.id, first.id),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
    assert.equal(await client.transaction.count({ where: { importBatchId: first.id } }), 1);

    await service.undo(owner.id, first.id);
    assert.equal(await client.importBatch.count({ where: { id: first.id } }), 0);
    assert.equal(await client.transaction.count({ where: { importBatchId: first.id } }), 0);
    assert.equal(await client.importBatch.count({ where: { id: second.id } }), 1);
    assert.equal(await client.transaction.count({ where: { importBatchId: second.id } }), 1);
  } finally {
    await cleanup(client, [owner.id, other.id], category.id);
    await client.$disconnect();
  }
});

test("PostgreSQL rolls back a newly created batch when row creation fails", async (t) => {
  const client = await connectedClient(t);
  if (!client) return;
  const { owner, other, category } = await fixture(client);
  const identifier = `task4_fail_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.$executeRawUnsafe(`
      CREATE FUNCTION "${identifier}"() RETURNS trigger AS $$
      BEGIN
        IF NEW."userId" = '${owner.id}' THEN
          RAISE EXCEPTION 'synthetic task4 insert failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.$executeRawUnsafe(`
      CREATE TRIGGER "${identifier}" BEFORE INSERT ON "Transaction"
      FOR EACH ROW EXECUTE FUNCTION "${identifier}"()
    `);
    const service = createImportService(createPrismaImportRepository(client), "ILS");

    await assert.rejects(service.confirm(owner.id, payload(category.id, "d")), /synthetic task4 insert failure/);
    assert.equal(await client.importBatch.count({ where: { userId: owner.id } }), 0);
    assert.equal(await client.transaction.count({ where: { userId: owner.id } }), 0);
  } finally {
    await client.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${identifier}" ON "Transaction"`);
    await client.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${identifier}"()`);
    await cleanup(client, [owner.id, other.id], category.id);
    await client.$disconnect();
  }
});
