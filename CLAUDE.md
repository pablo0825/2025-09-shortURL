# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A URL shortener backend API service built with Node.js + Express, PostgreSQL, and Redis. Handles short URL creation, lookup, and redirection with full RBAC auth, rate limiting, and 2FA support.

## Commands

```bash
npm run dev          # Development server (nodemon)
npm run typecheck    # TypeScript type check (no emit)
npm run lint         # ESLint
npm test             # Run all tests (vitest run)
npm run coverage     # Tests with V8 coverage report
npm run verify       # lint + typecheck + test (pre-commit gate)
npm run verify:full  # verify + coverage
npm run build        # Compile TypeScript to dist/
```

**Run a single test file:**
```bash
npx vitest run tests/services/admin-link-service.test.ts
```

**Pre-submission requirement:** `typecheck`, `lint`, and `test` must all pass. Minimum test coverage is 70%.

## Architecture

Strict layered architecture — cross-layer calls are forbidden:

```
Route → Controller → Service → Repository → Database (PostgreSQL)
```

- **Route** (`src/routes/`): Define paths and middleware only
- **Controller** (`src/controllers/`): Handle req/res, call services — no DB access
- **Service** (`src/services/`): Business logic — no `req`/`res` dependencies
- **Repository** (`src/repositories/`): SQL queries only — no business logic
- **lib** (`src/lib/`): Infrastructure wrappers with I/O (Redis, logger, email) — no business logic
- **utils** (`src/utils/`): Pure computation utilities, no external dependencies

**Exceptions:**
- RBAC permission middleware may call `src/lib/cache.ts` directly (cross-cutting concern)
- `src/rbac/` scripts must go through `src/repositories/`, never `src/db/pool.ts` directly

## Key Patterns

### Error Handling
- **Repository**: no try/catch — let errors propagate naturally
- **Service**: catch, add context (`[serviceName.method] original message`), rethrow
- **Controller**: no error handling — let errors reach error middleware
- No silent catches (`catch (e) {}`). Error logging is handled exclusively by error middleware.

### Redis / Cache
- All Redis access goes through `src/lib/cache.ts` — never use the Redis client directly
- Cache keys: `<module>:<identifier>` (e.g., `url:abc123`)
- All cache entries must have TTL — no permanent caching
- Cache-Aside pattern: Redis first → DB on miss → write back (only if data exists)
- On update/delete: update DB first, then invalidate Redis

### Zod Validation
- All external inputs (request body, query params, env vars) must use Zod schemas in `src/schemas/`
- Derive TypeScript types with `z.infer<typeof schema>` — don't duplicate type definitions

### Database
- Single `Pool` instance from `src/db/pool.ts` — never create new pools elsewhere
- Parameterized queries only (`$1, $2`), never string-concatenated SQL
- Transactions: `pool.connect()` with `BEGIN/COMMIT/ROLLBACK`, `client.release()` always in `finally`

### Logging
- Use `src/lib/logger.ts` — no `console.log` in production code
- Use `logger.info`, `logger.warn`, `logger.error`; log full error objects

## Code Style

- TypeScript strict mode, named exports only (no default exports)
- 4-space indentation, single quotes, semicolons required
- `async/await` only — no `.then()` chains
- `interface` for object shapes; `type` for unions/aliases
- No `any` type; no `as unknown as X` casts
- File names: `kebab-case.ts`; constants: `UPPER_SNAKE_CASE`
- Runtime enums (cross-module constants) → `src/enum/`; compile-time types → `src/types/`
- Functions kept to ~50 lines max; single responsibility

## Testing

Tests mirror the `src/` structure under `tests/`, named `kebab-case.test.ts`.

- **Service tests**: mock `src/repositories/` and `src/lib/cache.ts` — no real DB/Redis
- **Controller tests**: mock service layer
- **Utils/lib tests**: unit tests
- **RBAC tests**: mock repositories and cache
- Each test validates one thing; tests are order-independent

```ts
// Standard mock setup for service tests
vi.mock('../../src/repositories/admin/link-admin-repository', () => ({
  someRepoFn: vi.fn(),
}));

describe('service-name', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should do X when Y', async () => {
    // arrange → act → assert
  });
});
```

## Git & PR Conventions

Commit messages follow Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` — no scope suffix (not `feat(auth):`).

PR description must include: summary, affected endpoints/files, and any setup steps (DB migrations, env vars, Redis changes).

`main` branch is protected — always use feature branches (`feat/short-url-create`, `fix/redirect-404`).

## Constraints

- Do not modify `.env` or files containing real secrets
- Do not delete `tests/` or any test files
- Do not run destructive DB operations (`DROP TABLE`, data truncation)
- Do not install third-party packages without approval
- Do not `git push` unless explicitly asked
- Do not provide SQL schema changes as direct commands — write migration scripts for developer review
- Confirm before modifying `src/app.ts`, `src/index.ts`, or `src/rbac/`
- The codebase uses **CommonJS output** (TypeScript compiles to CJS). Do not migrate to ESM.

## Performance Targets

- P95 API response: < 500ms
- Cache-hit requests: < 50ms
- Cold DB queries: < 200ms

When adding queries, check for appropriate indexes and flag N+1 query risks.
