# Module Strategy

## Decision

This project standardizes on **CommonJS output**.

- `package.json` must keep `"type": "commonjs"`.
- `tsconfig.json` must keep `"compilerOptions.module": "CommonJS"`.

## Why We Chose This

- The current codebase, tests, and tooling are already stable with CommonJS.
- Migrating to `NodeNext` requires broad import-path updates (`.js` extensions) and increases short-term risk.
- Current priority is delivery stability and predictable CI behavior.

## Guardrails

- Do not switch `tsconfig.json` to `NodeNext` unless a dedicated ESM migration plan is approved.
- If ESM migration is needed in the future, perform it in staged batches with full regression checks after each batch.

## Required Checks

Before merge, run:

```bash
npm run verify:full
```
