import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const backendRoot = path.join(__dirname, "..");
const appSource = readFileSync(path.join(backendRoot, "src", "app.ts"), "utf8");
const schema = readFileSync(path.join(backendRoot, "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(
    backendRoot,
    "prisma",
    "migrations",
    "20260827210000_add_import_batches",
    "migration.sql",
  ),
  "utf8",
);

test("imports get an 8mb route-scoped JSON parser before the default parser", () => {
  assert.match(appSource, /importApi\.use\(express\.json\(\{\s*limit:\s*"8mb"\s*\}\)\)/);

  const importMount = appSource.indexOf('app.use("/v1/imports", importApi)');
  const defaultParser = appSource.indexOf("app.use(express.json())");
  assert.notEqual(importMount, -1);
  assert.notEqual(defaultParser, -1);
  assert.ok(importMount < defaultParser, "the scoped parser must run before the default parser");

  assert.doesNotMatch(appSource, /app\.use\(express\.json\(\{\s*limit:\s*"8mb"/);
});

test("transactions can reference only an import batch owned by the same user", () => {
  assert.match(
    schema,
    /@relation\(fields:\s*\[importBatchId,\s*userId\],\s*references:\s*\[id,\s*userId\],\s*onDelete:\s*Cascade\)/,
  );
  assert.match(schema, /@@unique\(\[id,\s*userId\]\)/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "ImportBatch_id_userId_key" ON "ImportBatch"\("id",\s*"userId"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("importBatchId",\s*"userId"\) REFERENCES "ImportBatch"\("id",\s*"userId"\) ON DELETE CASCADE ON UPDATE CASCADE/,
  );
});

test("import batch counters have nonnegative database checks", () => {
  for (const field of ["importedCount", "skippedCount", "rejectedCount"]) {
    assert.match(
      migration,
      new RegExp(`CONSTRAINT "ImportBatch_${field}_nonnegative" CHECK \\(\\"${field}\\" >= 0\\)`),
    );
  }
});
