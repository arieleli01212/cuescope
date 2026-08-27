# Security policy

CueScope handles sensitive financial data. Treat every deployment as a security-sensitive system.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for the repository. Do not open a public issue for a suspected vulnerability.

Include the affected version or commit, reproduction steps, impact, and any suggested mitigation. Do not include real banking credentials, API keys, account identifiers, or transaction exports.

## Supported versions

CueScope is currently pre-1.0. Security fixes are applied to the latest commit on `main`; older commits are not maintained as supported releases.

## Deployment responsibility

The default configuration is intended for local evaluation. Before exposing CueScope to a network, use strong unique credentials, restrict `CORS_ORIGIN`, terminate TLS at a trusted reverse proxy, protect backups, and keep the host and container images patched.
