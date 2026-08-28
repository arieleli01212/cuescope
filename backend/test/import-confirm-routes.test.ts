import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { inspect } from "node:util";
import test from "node:test";

const routes = readFileSync(path.join(__dirname, "..", "src", "routes", "import.routes.ts"), "utf8");
const controller = readFileSync(
  path.join(__dirname, "..", "src", "controllers", "import.controller.ts"),
  "utf8",
);

test("import routes register validated confirmation and owner-scoped undo", () => {
  assert.match(
    routes,
    /router\.post\(\s*"\/",\s*validate\(\{ body: confirmImportSchema \}\),\s*asyncHandler\(importController\.confirm\),?\s*\)/,
  );
  assert.match(
    routes,
    /router\.delete\(\s*"\/:id",\s*validate\(\{ params: importIdParamsSchema \}\),\s*asyncHandler\(importController\.undo\),?\s*\)/,
  );
});

test("confirmation and undo use the current authenticated user and standard data envelopes", () => {
  assert.match(controller, /importService\.confirm\(req\.user\.id, req\.body/);
  assert.match(controller, /res\.status\(201\)\.json\(\{ data: result \}\)/);
  assert.match(controller, /importService\.undo\(req\.user\.id, req\.params\.id\)/);
  assert.match(controller, /res\.status\(204\)\.send\(\)/);
});

test("POST and DELETE authenticate before parsing and return privacy-safe validation envelopes", async () => {
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "test";
  const [{ app }, { prisma }] = await Promise.all([
    import("../src/app"),
    import("../src/database/prisma"),
  ]);
  const user = prisma.user as unknown as {
    findUnique: (args: unknown) => Promise<{ id: string; name: string } | null>;
  };
  const originalFindUnique = user.findUnique;
  user.findUnique = async () => ({ id: "user-private", name: "Private User" });
  const logged: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  const server = app.listen(0);

  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}/v1/imports`;
    const unauthorized = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{malformed sensitive body",
    });
    assert.equal(unauthorized.status, 401, "authentication must run before the JSON parser");
    assert.deepEqual(await unauthorized.json(), {
      error: { code: "UNAUTHORIZED", message: "Missing X-API-Key header" },
    });

    const invalidConfirm = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "valid-test-key" },
      body: JSON.stringify({
        adapter: "credit-card-xlsx-v1",
        rows: [{ merchant: "Sensitive Merchant", amount: 9876.54 }],
      }),
    });
    assert.equal(invalidConfirm.status, 400);
    const confirmEnvelope = await invalidConfirm.json();
    assert.equal(confirmEnvelope.error.code, "VALIDATION_ERROR");
    assert.equal(confirmEnvelope.error.message, "Invalid request data");
    assert.doesNotMatch(JSON.stringify(confirmEnvelope), /Sensitive Merchant|9876\.54/);

    const invalidUndo = await fetch(`${baseUrl}/private-batch-name`, {
      method: "DELETE",
      headers: { "x-api-key": "valid-test-key" },
    });
    assert.equal(invalidUndo.status, 400);
    const undoEnvelope = await invalidUndo.json();
    assert.equal(undoEnvelope.error.code, "VALIDATION_ERROR");
    assert.equal(undoEnvelope.error.message, "Invalid request data");
    assert.doesNotMatch(JSON.stringify(undoEnvelope), /private-batch-name/);
    assert.doesNotMatch(inspect(logged, { depth: 8 }), /Sensitive Merchant|9876\.54|private-batch-name/);
    assert.equal(logged.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    console.error = originalConsoleError;
    user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  }
});
