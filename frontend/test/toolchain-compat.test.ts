import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lockfile = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as {
  packages: Record<
    string,
    { version?: string; engines?: { node?: string } } | undefined
  >;
};

test("test tooling stays compatible with the Node 20 and Vite 8 build", () => {
  assert.equal(
    lockfile.packages["node_modules/vitest/node_modules/vite"],
    undefined,
    "Vitest must use the project's Vite 8 instead of installing a nested Vite",
  );

  const jsdomNodeRange = lockfile.packages["node_modules/jsdom"]?.engines?.node;
  assert.ok(jsdomNodeRange, "jsdom must declare a supported Node engine range");
  assert.match(
    jsdomNodeRange,
    />=18/,
    `jsdom must support Node 20, received ${jsdomNodeRange}`,
  );

  const jestDomNodeRange =
    lockfile.packages["node_modules/@testing-library/jest-dom"]?.engines?.node;
  assert.ok(
    jestDomNodeRange,
    "@testing-library/jest-dom must declare a supported Node engine range",
  );
  assert.match(
    jestDomNodeRange,
    />=14/,
    `@testing-library/jest-dom must support Node 20, received ${jestDomNodeRange}`,
  );
  assert.doesNotMatch(
    jestDomNodeRange,
    />=22/,
    "@testing-library/jest-dom must not require Node 22",
  );
});
