# Security policy

CueScope handles sensitive financial data. Treat every deployment as a security-sensitive system.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for the repository. Do not open a public issue for a suspected vulnerability.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Do not include real banking credentials, API keys, account identifiers, or transaction exports.

Do not attach real credit-card statements, XLSX exports, or screenshots of them to public issues or vulnerability reports, even when reporting an import bug. File import parses the workbook entirely in the browser: the raw file, filename, voucher number, and extra-detail column are never uploaded, stored, or logged, so a synthetic file with fake merchants and amounts is sufficient to reproduce most import issues.

## Supported versions

CueScope is currently pre-1.0. Security fixes are applied to the latest commit on `main`; older commits are not maintained as supported releases.

## Deployment responsibility

The default configuration is intended for local evaluation. Before exposing CueScope to a network, use strong unique credentials, restrict `CORS_ORIGIN`, terminate TLS at a trusted reverse proxy, protect backups, and keep the host and container images patched.
