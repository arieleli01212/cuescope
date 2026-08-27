import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { inspect } from "node:util";
import test from "node:test";

const headers = { "content-type": "application/json", "x-api-key": "valid-test-key" };

async function withAuthenticatedImportApp(
  run: (url: string, logged: unknown[][]) => Promise<void>,
): Promise<void> {
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
    const url = `http://127.0.0.1:${port}/v1/imports/preview`;
    await run(url, logged);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    console.error = originalConsoleError;
    user.findUnique = originalFindUnique;
    await prisma.$disconnect();
  }
}

test("authenticated malformed JSON gets a safe 400 without logging request data", async () => {
  await withAuthenticatedImportApp(async (url, logged) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: '{"merchant":"Sensitive Merchant","amount":9876.54,',
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: "BAD_REQUEST", message: "Malformed JSON request body" },
    });
    assert.doesNotMatch(inspect(logged, { depth: 8 }), /Sensitive Merchant|9876\.54/);
    assert.equal(logged.length, 0, "expected parser errors not to be logged as server failures");
  });
});

test("authenticated oversized import gets a safe 413 without logging request data", async () => {
  await withAuthenticatedImportApp(async (url, logged) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        merchant: "Oversized Sensitive Merchant",
        amount: 123456.78,
        padding: "x".repeat(8 * 1024 * 1024),
      }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
    });
    assert.doesNotMatch(inspect(logged, { depth: 8 }), /Oversized Sensitive Merchant|123456\.78/);
    assert.equal(logged.length, 0, "expected parser errors not to be logged as server failures");
  });
});
