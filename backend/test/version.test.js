const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("readVersionInfo reads the CalVer stamp next to the compiled module and falls back to dev", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "version.ts"),
    "utf8"
  );

  assert.match(source, /readFileSync\(join\(__dirname, "version\.json"\), "utf8"\)/);
  assert.match(
    source,
    /FALLBACK_VERSION:\s*VersionInfo\s*=\s*\{\s*version:\s*null,\s*commit:\s*"dev",\s*buildTime:\s*null,?\s*\}/
  );
  assert.match(source, /typeof parsed\.version === "string"/);
  assert.doesNotMatch(source, /buildNumber/);
  assert.match(source, /catch\s*\{\s*return FALLBACK_VERSION;\s*\}/);
});

test("app.ts exposes version, commit, and buildTime on /health", () => {
  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "app.ts"),
    "utf8"
  );

  assert.match(appSource, /readVersionInfo\(\)/);
  assert.match(
    appSource,
    /res\.status\(200\)\.json\(\{\s*status:\s*"ok",\s*version,\s*commit,\s*buildTime\s*\}\)/
  );
  assert.doesNotMatch(appSource, /buildNumber/);
});
