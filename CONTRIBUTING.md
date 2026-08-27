# Contributing to CueScope

Thank you for helping make household finance software more transparent and self-hostable.

## Before you start

- Search existing issues before opening a new one.
- For a substantial feature or architectural change, open an issue first so the scope can be agreed on.
- Never include real financial records, account identifiers, API keys, or credentials in issues, fixtures, screenshots, or commits.

## Development workflow

1. Fork the repository and create a focused branch.
2. Add or update tests with the change.
3. Run both test suites and builds:

   ```bash
   cd backend && npm ci && npm run prisma:generate && npm test && npm run build
   cd ../frontend && npm ci && npm test && npm run build
   ```

4. Keep commits small and explain the user-visible impact in the pull request.
5. Confirm that test data is synthetic.

By submitting a contribution, you agree that it is licensed under Apache-2.0.
