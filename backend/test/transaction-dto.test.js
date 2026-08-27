const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("update transaction DTO accepts null to clear a note", () => {
  const dto = fs.readFileSync(
    path.join(__dirname, "..", "src", "dto", "transaction.dto.ts"),
    "utf8"
  );
  const createSchema = dto.slice(
    dto.indexOf("export const createTransactionSchema"),
    dto.indexOf("export type CreateTransactionDto")
  );
  const updateSchema = dto.slice(
    dto.indexOf("export const updateTransactionSchema"),
    dto.indexOf("export type UpdateTransactionDto")
  );

  assert.doesNotMatch(createSchema, /note:[^\n]*\.nullable\(\)/);
  assert.match(updateSchema, /note:\s*z\.string\(\)\.trim\(\)\.max\(500\)\.nullable\(\)\.optional\(\)/);
});
