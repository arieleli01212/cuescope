import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUpdatePayload,
  hasChartData,
  buildChartAriaLabel,
  createLatestRequestGate,
  filterTransactions,
  groupCategories,
  settleRefreshes,
  shouldRefreshTransactions,
} from "../src/lib/dashboardHelpers.ts";

// הועבר מ-test/dashboard-helpers.test.js הישן: מכסה את אותה לוגיקה טהורה,
// שהועברה כמות שהיא ל-src/lib/dashboardHelpers.ts. בוני ה-markup (buildTransactionMarkup
// וכו') ובדיקות ה-DOM המדומה (dashboard-runtime.test.js) לא הועברו - React
// מרנדר JSX במקום מחרוזות HTML; כיסוי מקביל לרכיבים צריך לבוא מבדיקות
// קומפוננטות (למשל Vitest + React Testing Library) - זו עדיין לא נכתבה, ר' TODO.

test("buildUpdatePayload includes all editable fields and clears an empty note", () => {
  assert.deepEqual(
    buildUpdatePayload({
      type: "INCOME",
      amount: "12.50",
      currency: "USD",
      categoryId: "category-2",
      note: "   ",
    }),
    {
      type: "INCOME",
      amount: 12.5,
      currency: "USD",
      categoryId: "category-2",
      note: null,
    }
  );
});

test("hasChartData rejects empty and zero-only series", () => {
  assert.equal(hasChartData([]), false);
  assert.equal(hasChartData([0, 0]), false);
  assert.equal(hasChartData([0, 4]), true);
});

test("buildChartAriaLabel summarizes labels+data, or says there's no data", () => {
  assert.equal(buildChartAriaLabel(["a", "b"], [0, 0]), "אין נתונים להצגה");
  assert.equal(buildChartAriaLabel(["הכנסות", "הוצאות"], [100, 40]), "הכנסות: 100.00, הוצאות: 40.00");
});

test("shouldRefreshTransactions: submitting only refreshes on postMutation", () => {
  assert.equal(shouldRefreshTransactions({ submitting: true, postMutation: false }), false);
  assert.equal(shouldRefreshTransactions({ submitting: true, postMutation: true }), true);
});

test("shouldRefreshTransactions: not submitting refreshes unless the editor is open (or force)", () => {
  assert.equal(shouldRefreshTransactions({ editorOpen: true }), false);
  assert.equal(shouldRefreshTransactions({ editorOpen: true, force: true }), true);
  assert.equal(shouldRefreshTransactions({ editorOpen: false }), true);
});

test("filterTransactions combines free-text and type filters", () => {
  const items = [
    { id: "1", type: "EXPENSE" as const, amount: 40, currency: "ILS" as const, occurredAt: "2026-08-01", note: "קפה", category: { id: "c1", name: "אוכל" } },
    { id: "2", type: "INCOME" as const, amount: 1000, currency: "ILS" as const, occurredAt: "2026-08-02", note: "משכורת", category: { id: "c2", name: "עבודה" } },
  ];
  assert.deepEqual(filterTransactions(items, "קפה", "EXPENSE").map((item) => item.id), ["1"]);
  assert.deepEqual(filterTransactions(items, "עבודה", "ALL").map((item) => item.id), ["2"]);
});

test("groupCategories preserves first-seen group and category order while normalizing names", () => {
  const categories = [
    { id: "1", name: "קפה", group: "  אוכל  " },
    { id: "2", name: "שונות", group: null },
    { id: "3", name: "מסעדות", group: "אוכל" },
    { id: "4", name: "תחבורה", group: " נסיעות " },
    { id: "5", name: "כללי", group: "   " },
  ];

  assert.deepEqual(groupCategories(categories), [
    { key: "group:אוכל", name: "אוכל", categories: [categories[0], categories[2]] },
    { key: "ungrouped", name: "ללא נושא", categories: [categories[1], categories[4]] },
    { key: "group:נסיעות", name: "נסיעות", categories: [categories[3]] },
  ]);
  assert.equal(categories[0].group, "  אוכל  ");
});

test("groupCategories keeps an explicit group named ללא נושא separate from the ungrouped bucket", () => {
  const explicit = { id: "1", name: "מפורש", group: "ללא נושא" };
  const ungrouped = { id: "2", name: "ריק", group: null };

  assert.deepEqual(groupCategories([explicit, ungrouped]), [
    { key: "group:ללא נושא", name: "ללא נושא", categories: [explicit] },
    { key: "ungrouped", name: "ללא נושא", categories: [ungrouped] },
  ]);
});

test("latest request gate marks older concurrent category reloads as stale", () => {
  const gate = createLatestRequestGate();
  const requestA = gate.issue();
  const requestB = gate.issue();

  assert.equal(gate.isCurrent(requestA), false);
  assert.equal(gate.isCurrent(requestB), true);
});

test("settleRefreshes waits for every refresh and never rejects the completed mutation", async () => {
  let secondFinished = false;
  const failedRefresh = Promise.reject(new Error("refresh failed"));
  const successfulRefresh = Promise.resolve().then(() => {
    secondFinished = true;
  });

  await assert.doesNotReject(settleRefreshes([failedRefresh, successfulRefresh]));
  assert.equal(secondFinished, true);
});
