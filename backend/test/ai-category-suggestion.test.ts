import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategorySuggestionMessages,
  createOpenRouterCategorySuggester,
  noopCategorySuggester,
  parseCategorySuggestion,
} from "../src/services/ai-category-suggestion";

test("noopCategorySuggester always returns null without any I/O", async () => {
  assert.equal(await noopCategorySuggester.suggest("Demo Shop", ["מכולת"]), null);
});

test("buildCategorySuggestionMessages sends only the merchant name and category names", () => {
  const messages = buildCategorySuggestionMessages("Demo Shop", ["מכולת", "תחבורה"]);
  const serialized = JSON.stringify(messages);
  assert.match(serialized, /Demo Shop/);
  assert.match(serialized, /מכולת/);
  assert.match(serialized, /תחבורה/);
  // Never leak anything beyond the merchant name and the category list.
  assert.doesNotMatch(serialized, /\d{2,}/); // no amounts/dates/ids
});

test("parseCategorySuggestion accepts only an exact match from the offered list", () => {
  const categories = ["מכולת", "תחבורה", "בריאות"];
  assert.equal(parseCategorySuggestion("מכולת", categories), "מכולת");
  assert.equal(parseCategorySuggestion(" מכולת \n", categories), "מכולת");
});

test("parseCategorySuggestion rejects NONE, empty, and hallucinated categories", () => {
  const categories = ["מכולת", "תחבורה"];
  assert.equal(parseCategorySuggestion("NONE", categories), null);
  assert.equal(parseCategorySuggestion("none", categories), null);
  assert.equal(parseCategorySuggestion("", categories), null);
  assert.equal(parseCategorySuggestion(null, categories), null);
  assert.equal(parseCategorySuggestion(undefined, categories), null);
  assert.equal(parseCategorySuggestion("קטגוריה שלא קיימת", categories), null);
  // A category name that isn't in the exact offered list, even if plausible.
  assert.equal(parseCategorySuggestion("Groceries", categories), null);
});

test("createOpenRouterCategorySuggester posts the merchant and categories and returns a validated match", async () => {
  let capturedBody: unknown;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    capturedBody = JSON.parse(init.body as string);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "מכולת" } }] }),
    } as Response;
  }) as typeof fetch;

  const suggester = createOpenRouterCategorySuggester({
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  const result = await suggester.suggest("Demo Shop", ["מכולת", "תחבורה"]);
  assert.equal(result, "מכולת");
  assert.equal((capturedBody as { model: string }).model, "test-model");
});

test("createOpenRouterCategorySuggester returns null on a non-OK response instead of throwing", async () => {
  const fetchImpl = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
  const suggester = createOpenRouterCategorySuggester({ apiKey: "k", model: "m", fetchImpl });
  assert.equal(await suggester.suggest("Demo Shop", ["מכולת"]), null);
});

test("createOpenRouterCategorySuggester returns null on a network error or timeout instead of throwing", async () => {
  const fetchImpl = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const suggester = createOpenRouterCategorySuggester({ apiKey: "k", model: "m", fetchImpl });
  assert.equal(await suggester.suggest("Demo Shop", ["מכולת"]), null);
});

test("createOpenRouterCategorySuggester skips the network call entirely when there are no categories to offer", async () => {
  let called = false;
  const fetchImpl = (async () => { called = true; return { ok: true, json: async () => ({}) }; }) as unknown as typeof fetch;
  const suggester = createOpenRouterCategorySuggester({ apiKey: "k", model: "m", fetchImpl });
  assert.equal(await suggester.suggest("Demo Shop", []), null);
  assert.equal(called, false);
});
