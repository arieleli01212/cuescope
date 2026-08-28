# CueScope

> See the pattern. Catch the cue.

CueScope is an open-source, self-hosted household finance dashboard. It brings income, expenses, categories, currencies, and household members into one explainable view while keeping the data on infrastructure you control.

The project is an early working release. Transaction management, categorization, monthly analytics, multi-currency normalization, API-key access, and Docker deployment are implemented today. Automated open-banking sync, trend detection, and the optional AI layer are on the roadmap and are not presented as completed features.

## What works today

- Shared income and expense tracking for a household
- Responsive web dashboard with monthly totals and category charts
- Transaction creation, editing, deletion, filtering, and notes
- Merchant-aware categorization for transactions submitted by automations such as Apple Shortcuts
- Local import of Hebrew credit-card XLSX statements, with a private preview, per-merchant category mapping, idempotent confirmation, and one-click undo
- ILS, USD, and EUR normalization with exchange-rate snapshots
- Per-user API keys and a small REST API
- Self-hosted deployment with Docker Compose
- Backend and frontend test suites in GitHub Actions

## Architecture

```text
Browser / Shortcut
        |
        v
  nginx frontend  ---->  Express API  ---->  PostgreSQL
   React + Vite          Prisma + Zod
```

The browser and automations use the same origin. nginx serves the React application and proxies `/v1/*` and `/health` to the API.

## Quick start

Requirements: Docker with the Compose plugin.

```bash
git clone https://github.com/arieleli01212/cuescope.git
cd cuescope
cp .env.example .env
```

Change `POSTGRES_PASSWORD` and `SEED_USER_API_KEYS` in `.env`, then run:

```bash
docker compose up -d --build
docker compose exec backend npm run prisma:seed
```

Open `http://localhost:3001` and sign in with the key you configured in `SEED_USER_API_KEYS`.

Multiple seed users can be configured with matching comma-separated values:

```dotenv
SEED_USER_NAMES=Alex,Sam
SEED_USER_API_KEYS=replace-with-alex-key,replace-with-sam-key
```

Do not use the example credentials with real financial data or on a public deployment.

## Local development

Start PostgreSQL:

```bash
cp .env.example .env
docker compose up -d postgres
```

Start the API:

```bash
cp .env.example backend/.env
cd backend
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run prisma:seed
npm run dev
```

When changing the database password for local development, update it in both `POSTGRES_PASSWORD` and `DATABASE_URL`.

In another terminal, start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

## Tests

```bash
cd backend && npm ci && npm run prisma:generate && npm test && npm run build
cd ../frontend && npm ci && npm test && npm run build
```

## API

Every endpoint except `/health` requires an `X-API-Key` header.

- `GET /health`
- `GET /v1/me`
- `GET|POST /v1/categories`
- `PATCH|DELETE /v1/categories/:id`
- `GET|POST /v1/transactions`
- `PATCH|DELETE /v1/transactions/:id`
- `GET /v1/transactions/summary?month=YYYY-MM`
- `POST /v1/imports/preview` / `POST /v1/imports` / `DELETE /v1/imports/:id`

`GET /v1/transactions` accepts `month`, `categoryId`, `userId`, and `type` filters.

## File import

The Transactions tab can import the approved Hebrew credit-card XLSX statement format directly from the browser:

- The browser parses the `.xlsx` file locally (up to 5 MB, 5,000 data rows) with a format-specific adapter and sends only normalized rows to the backend.
- The raw workbook, filename, voucher number, and extra-detail column are never uploaded, stored, or logged.
- Rows are previewed before import: merchant category suggestions (explicit mapping, merchant history, or a fallback category), duplicate detection, and row-level rejections (row number and reason only, never merchant or amount).
- Confirming an import is idempotent (a fingerprint per user/row prevents duplicate transactions) and reversible: undoing a batch removes exactly the transactions it created.
- Only local file adapters are supported today; consent-based bank/card synchronization through licensed providers remains a planned, separate feature (see the roadmap).

## Roadmap

The next milestones focus on visibility and explainable trend detection, consent-based bank and card synchronization through licensed providers, and an optional provider-neutral AI layer. See [the roadmap](docs/roadmap.md) for the planned boundaries and privacy principles.

## Contributing and security

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Please do not open public issues containing real transactions, account identifiers, API keys, or banking credentials. Report vulnerabilities using the process in [SECURITY.md](SECURITY.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
