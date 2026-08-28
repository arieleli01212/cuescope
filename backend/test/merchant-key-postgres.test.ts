import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { canonicalMerchant } from "../src/services/import-core";
import { merchantCanonicalizationCorpus } from "./merchant-key-corpus";

const testDatabaseUrl = process.env.MERCHANT_KEY_TEST_DATABASE_URL;
const migration = readFileSync(
  path.join(
    __dirname,
    "..",
    "prisma",
    "migrations",
    "20260827220000_add_transaction_merchant_key",
    "migration.sql",
  ),
  "utf8",
);

const updateStatement = migration.match(
  /UPDATE "Transaction"[\s\S]*?WHERE "merchant" IS NOT NULL;/,
)?.[0];

test(
  "PostgreSQL migration canonicalization matches JavaScript for the corpus",
  { skip: testDatabaseUrl ? false : "MERCHANT_KEY_TEST_DATABASE_URL is not set" },
  async () => {
    assert.ok(updateStatement, "merchant-key migration UPDATE statement was not found");
    assert.ok(testDatabaseUrl, "MERCHANT_KEY_TEST_DATABASE_URL is required");

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });

    try {
      const rows = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`
          CREATE TEMP TABLE "Transaction" (
            "position" INTEGER PRIMARY KEY,
            "merchant" TEXT,
            "merchantKey" TEXT
          ) ON COMMIT DROP
        `);

        for (const [position, { input }] of merchantCanonicalizationCorpus.entries()) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "Transaction" ("position", "merchant") VALUES ($1, $2)`,
            position,
            input,
          );
        }

        await tx.$executeRawUnsafe(updateStatement);
        return tx.$queryRawUnsafe<Array<{ position: number; merchantKey: string | null }>>(
          `SELECT "position", "merchantKey" FROM "Transaction" ORDER BY "position"`,
        );
      });

      assert.deepEqual(
        rows.map(({ merchantKey }, position) => ({
          sql: merchantKey,
          javascript: canonicalMerchant(merchantCanonicalizationCorpus[position].input) || null,
          expected: merchantCanonicalizationCorpus[position].expected || null,
        })),
        merchantCanonicalizationCorpus.map(({ expected }) => ({
          sql: expected || null,
          javascript: expected || null,
          expected: expected || null,
        })),
      );
    } finally {
      await prisma.$disconnect();
    }
  },
);
