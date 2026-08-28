# CueScope roadmap

CueScope is built around a simple promise: show households what is changing in their finances and make every conclusion traceable to the underlying data.

## Current foundation

- Self-hosted transaction and category management
- Shared household view with per-user attribution
- Monthly summaries and category visualizations
- Multi-currency normalization with historical rate snapshots
- REST ingestion suitable for Apple Shortcuts and other automations
- Merchant-based reuse of prior categorization
- Local import of Hebrew credit-card XLSX statements, with private browser-side parsing, preview, category mapping, idempotent confirmation, and undo

## Next milestones

### 1. Visibility and trend detection

- Recurring-payment and duplicate detection
- Month-over-month category and merchant trends
- Explainable anomaly alerts with the contributing transactions
- Cash-flow projections with confidence ranges

### 2. Open-banking adapters

- Provider-neutral ingestion interface
- Consent-based bank and credit-card synchronization through licensed providers
- Idempotent imports, reconciliation, and auditable source metadata
- Synthetic provider for development and integration tests

### 3. Optional AI layer

- Merchant normalization and explainable categorization suggestions
- Natural-language questions over household data
- Concise summaries that cite source transactions
- Evaluation against synthetic or redacted datasets
- Pluggable providers, including local models

## Privacy boundaries

- AI features will be opt-in.
- Banking credentials and account authentication secrets will never be sent to a model.
- Model-facing data will be minimized and documented.
- Every generated conclusion should expose its evidence and confidence.
- Core transaction management will continue to work without an AI provider.
