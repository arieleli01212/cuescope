# Trend Engine v1 Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Show explainable month-over-month expense changes by category and merchant, with transaction-level evidence.

**Architecture:** Pure backend functions select aligned periods and rank aggregate expense changes. Authenticated aggregate and evidence endpoints expose server-calculated results. The Summary UI renders category/merchant tabs and fetches evidence only when an insight is selected.

**Tech Stack:** TypeScript, Express, Prisma/PostgreSQL, React 18, Vitest/Testing Library, existing CueScope UI primitives.

---

### Task 1: Implement and test aligned comparison periods

**Files:**
- Create: backend/src/services/trend-core.ts
- Create: backend/test/trend-periods.test.ts

**Step 1: Write failing tests**

Cover:

- completed month to prior completed month;
- current month-to-date to the same prior-month day span;
- January/December boundary;
- February and a prior month with fewer days;
- future month rejection;
- malformed month rejection.

Use an injected now Date so tests are deterministic.

Expected shape:

~~~ts
{
  mode: "FULL_MONTH" | "MONTH_TO_DATE";
  current: { start: Date; endExclusive: Date };
  previous: { start: Date; endExclusive: Date };
}
~~~

**Step 2: Run test — confirm failure**

Command: cd backend && npm test

Expected: FAIL because trend-core.ts is absent.

**Step 3: Implement minimal UTC period selection**

Implement strict YYYY-MM parsing and use UTC boundaries only. For current month, cap
the previous period's end day to the available days in that previous month.

**Step 4: Verify**

Command: cd backend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: calculate aligned trend periods

---

### Task 2: Implement deterministic trend aggregation and ranking

**Files:**
- Modify: backend/src/services/trend-core.ts
- Create: backend/test/trend-aggregation.test.ts

**Step 1: Write failing tests**

Use synthetic expense/income transactions to cover:

- category and normalized merchant grouping;
- amountBase use across currencies;
- income exclusion;
- missing merchant exclusion from merchant dimension only;
- new and disappeared buckets;
- percentage only above baseline floor;
- threshold max(50, 1% of period spending);
- separate increases/decreases sorted by absolute delta;
- top-three cap;
- evidence key stability.

**Step 2: Run test — confirm failure**

Command: cd backend && npm test

Expected: FAIL because aggregateTrends is absent.

**Step 3: Implement**

Define TrendTransaction, TrendInsight, TrendDimensionResult, and TrendResponse types.
Reuse canonicalMerchant from import-core to keep merchant identity rules consistent.
Return amounts as decimal-safe strings at the API boundary.

**Step 4: Verify**

Command: cd backend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: rank explainable spending trends

---

### Task 3: Add authenticated aggregate and evidence APIs

**Files:**
- Create: backend/src/dto/trend.dto.ts
- Create: backend/src/services/trend.service.ts
- Create: backend/src/controllers/trend.controller.ts
- Create: backend/src/routes/trend.routes.ts
- Modify: backend/src/app.ts
- Create: backend/test/trend-api.test.ts

**Step 1: Write failing tests**

Cover month validation, aggregate service query bounds, response shape, insufficient
history, category evidence, merchant evidence, invalid dimension/key, auth ownership,
and current/previous evidence grouping.

**Step 2: Run test — confirm failure**

Command: cd backend && npm test

Expected: FAIL because endpoints are absent.

**Step 3: Implement endpoints**

~~~text
GET /v1/trends?month=YYYY-MM
GET /v1/trends/evidence?month=YYYY-MM&dimension=category|merchant&key=...
~~~

The aggregate service performs one transaction query from previous.start through
current.endExclusive. Evidence repeats the bounded period query for the selected key,
returns only authenticated household data, and never interpolates the key into raw SQL.

**Step 4: Verify**

Command: cd backend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: expose trend and evidence APIs

---

### Task 4: Build the Summary trend section

**Files:**
- Create: frontend/src/components/TrendInsights.tsx
- Create: frontend/src/test/trend-insights.test.tsx
- Modify: frontend/src/types.ts

**Step 1: Write failing component tests**

Cover loading, API error, insufficient data, explicit period label, category/merchant
tabs, top increases/decreases, new label without percentage, disappeared spend,
currency formatting, and accessible insight buttons.

**Step 2: Run focused test — confirm failure**

Command: cd frontend && npx vitest run src/test/trend-insights.test.tsx

Expected: FAIL because component is absent.

**Step 3: Implement component**

Render the section below KPI cards with existing Card, Button, Alert, and tab-like
button patterns. Keep the response presentation-only; do not recompute financial
aggregates in the browser.

**Step 4: Verify**

Command: cd frontend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: show category and merchant trends

---

### Task 5: Add transaction evidence sheet and App data flow

**Files:**
- Create: frontend/src/components/TrendEvidenceSheet.tsx
- Create: frontend/src/test/trend-evidence-sheet.test.tsx
- Modify: frontend/src/components/SummaryTab.tsx
- Modify: frontend/src/App.tsx
- Modify: frontend/src/test/summary-tab.test.tsx
- Modify: frontend/src/test/shell.test.tsx

**Step 1: Write failing tests**

Cover trend loading on login/month change, stale request suppression, selecting an
insight, lazy evidence fetch, separate current/previous groups, empty evidence, API
error/retry, close/focus return, mobile layout, RTL, and unauthorized behavior.

**Step 2: Run tests — confirm failure**

Command: cd frontend && npm run test:components

Expected: FAIL because data flow and sheet are absent.

**Step 3: Implement**

App owns trend and evidence API requests using the existing authenticated callApi
wrapper and latest-request gates. SummaryTab receives trend state and callbacks.
Selecting an insight opens TrendEvidenceSheet and triggers the evidence request.

**Step 4: Verify**

Command: cd frontend && npm test && npm run build

Expected: PASS.

**Step 5: Commit**

Commit: feat: expose evidence behind every trend

---

### Task 6: Document, validate, review, and open PR

**Files:**
- Modify: README.md
- Modify: docs/roadmap.md

**Step 1: Update documentation**

Mark month-over-month category and merchant trends as shipped. Keep recurring,
duplicate, anomaly, forecast, and AI features explicitly planned.

**Step 2: Full verification**

Run backend tests/build, frontend tests/build, Compose validation, diff check, and a
synthetic end-to-end smoke test. Scan tracked files and logs for private transaction
data.

**Step 3: Private acceptance**

After File Import v1 has been separately approved and deployed, validate trend output
against imported private transactions without logging merchants or amounts.

**Step 4: Review and PR**

Run spec review and code-quality review, fix findings, push feat/trend-engine-v1, open
the public PR, and wait for all required checks.

Do not merge, backport, or deploy without Ariel's separate approval.
