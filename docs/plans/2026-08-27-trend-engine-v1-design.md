# Trend Engine v1 Design

## Goal

Show the household the most meaningful month-over-month expense changes by category
and merchant, while making every conclusion traceable to the transactions that
caused it.

## Scope and user experience

The Summary screen gets a `מה השתנה?` section below the KPI cards. It names the two
compared periods explicitly and contains `קטגוריות` and `בתי עסק` tabs. Each tab
shows up to three meaningful increases and three meaningful decreases.

Each insight displays the current amount, absolute change, and percentage change
when a meaningful baseline exists. A bucket with no prior-period spend is labeled
`חדש` rather than displaying an infinite percentage. Selecting an insight opens a
sheet containing the contributing current and previous period transactions.

An honest empty state is shown when prior history is insufficient. v1 analyzes
expenses only. Recurring payments, duplicate detection, anomaly alerts, income
trends, and cash-flow forecasting remain later milestones.

## Period selection

The backend owns all period calculations:

- A completed selected month compares the complete month with the complete previous
  month.
- The current selected month compares month-to-date with the same day range of the
  previous month.
- Future and malformed `YYYY-MM` values return 400.

This avoids comparing a partial current month with a complete previous month and is
independent of card billing cycles.

## Calculation model

`GET /v1/trends?month=YYYY-MM` fetches both periods in one bounded database query.
All comparisons use `amountBase` so currencies are comparable.

Transactions are grouped by category ID and by a conservative merchant key. Merchant
normalization applies Unicode/case normalization, trimming, and whitespace collapse
only. Fuzzy merchant merging is intentionally deferred.

For each bucket:

```text
deltaAmount = currentAmount - previousAmount
```

A percentage is returned only when the previous amount passes the baseline floor;
otherwise the bucket is marked new. Noise is filtered when the absolute delta is
below `max(50 ILS, 1% of period spending)`. Remaining increases and decreases are
ranked by absolute financial impact, not inflated percentages.

The service computes insights on demand rather than persisting them. Transaction
edits and deletions therefore affect the next response immediately and require no
trend invalidation workflow or schema migration.

## Evidence API

The aggregate response carries stable dimension/key identifiers and the period
metadata. A second authenticated endpoint loads the current and previous
transactions for the selected category or normalized merchant. The server validates
the requested dimension and limits the query to the already defined periods.

Evidence responses reuse the safe transaction representation and do not include API
keys or other authentication material.

## Error and empty states

- No previous-period expenses: insufficient data, not zero change.
- New spend: `חדש`, no percentage.
- Disappeared spend: a complete decrease with previous-period evidence.
- No merchant: excluded from merchant insights but retained in category insights.
- Income and unsupported refund semantics: excluded from v1.
- Database/API failure: existing error envelope and retryable UI state.

## Testing

Pure functions cover completed months, current MTD alignment, month/year boundaries,
baseline zero, new and disappeared merchants, the dynamic threshold, multi-currency
`amountBase`, conservative merchant normalization, ranking, and top-three limits.

API tests cover authentication, month validation, aggregate response shape, evidence
ownership/scope, and empty states. Frontend tests cover loading/error/empty states,
period labels, tabs, cards, new-spend labels, evidence sheets, RTL, accessibility,
desktop, and mobile behavior. All fixtures are synthetic.

After File Import v1 is accepted in the private deployment, the imported private
transactions provide local acceptance data. No real transaction appears in Git,
test output, logs, or an external model/API.

## Delivery

Trend Engine v1 follows File Import v1 in its own `feat/trend-engine-v1` branch and
public PR. The private production repository and deployment change only after a
separate approval following public CI and review.
