# AGENTS.md

> This document is intended for AI Coding Agents (e.g., Claude Code, Codex, etc.).
> It describes the project structure, development standards, and operational constraints.
> Please read it in full before executing any task.

---

## Project Overview

This project is a **URL shortener backend API service** responsible for creating, querying, and redirecting short URLs. It uses Node.js + Express to handle requests, PostgreSQL to store URL data, and Redis to cache frequently accessed short URLs for improved query performance.

### Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express |
| Database | PostgreSQL |
| Cache | Redis |
| Validation | Zod |
| Testing | Vitest |
| Rate Limiting | express-rate-limit |
| Security Headers | helmet |
| Reverse Proxy | Nginx |
| Containerization | Docker |

---

## Environment Setup

When setting up the project for the first time, run the following command to install dependencies:

```bash
npm install
```

---

## Project Structure

```
.
├── src/
│   ├── routes/          # Express route definitions
│   ├── controllers/     # Request handling, calls the service layer
│   ├── middlewares/     # Middleware (validation, error handling, etc.)
│   ├── db/              # Database connection config (pool.ts)
│   ├── repositories/    # PostgreSQL query encapsulation
│   ├── services/        # Business logic
│   ├── schemas/         # Zod schema definitions
│   ├── types/           # Custom TypeScript types / interfaces
│   ├── lib/             # Infrastructure wrappers (third-party service wrappers, no business logic, e.g. cache.ts, logger.ts)
│   ├── utils/           # General utility functions (no business logic)
│   ├── rbac/            # Permission initialization scripts (auto-executed on startup, seeds roles and permissions)
│   ├── enum/            # Shared enum constants (e.g. HttpMethod, HttpStatus)
│   ├── app.ts           # Express application entry (creates app, registers middleware and routes)
│   └── index.ts         # Server initialization entry (starts HTTP server, connects DB and Redis, runs rbac, etc.)
├── tests/               # Test files (mirroring src/ structure)
├── specs/               # Project background docs (for developers only, Agent does not need to read)
├── database/
│   └── schema.sql       # Table creation SQL (maintained manually)
├── .env.example         # Environment variable template (no sensitive data)
├── docker-compose.yml   # Docker container orchestration config
├── tsconfig.json
├── package.json
└── AGENTS.md
```

> When adding new files, follow the directory structure above. Do not create new folders arbitrarily in the root directory.

> File placement guideline: Put encapsulations with external dependencies or I/O operations (e.g., Redis, logging libraries) in `src/lib/`; put pure computational functions with no external dependencies in `src/utils/`.

> `enum/` vs `types/` guideline: Put shared constants that have actual values at runtime (e.g., `HttpMethod`, `AuthEvent`) in `src/enum/`; put type definitions that only exist at compile time (e.g., `interface`, `type alias`) in `src/types/`.

---

## Layered Architecture

Strictly follow the order below. Cross-layer calls are not allowed. Any exceptions due to special architectural requirements must be explicitly documented in this file.

```
Route → Controller → Service → Repository → Database
```

| Layer | Responsibility |
|-------|----------------|
| **Route** | Defines API paths and middleware. Contains no business logic. |
| **Controller** | Handles Request / Response, calls Service. Must not access the database directly. |
| **Service** | Core business logic. Must not depend on any HTTP objects (`req`, `res`). |
| **Repository** | Contains only database operations. Contains no business logic. |
| **Database** | PostgreSQL database, connected via `src/db/pool.ts`. |

> **Redis cache** is encapsulated in `src/lib/cache.ts` as an infrastructure wrapper with no business logic. It is called by the Service layer when needed and does not belong to the Repository layer.

> **RBAC permission control** is implemented in-house without third-party packages. On startup, `src/index.ts` triggers the initialization scripts in `src/rbac/`, which read role and permission data from the database via the `src/repositories/` layer and write them into Redis cache via `src/lib/cache.ts`. At runtime, permission checks always read from Redis to avoid repeated database queries.

> RBAC permission middleware may call `src/lib/cache.ts` directly to read permission data, without going through the Service layer. Middleware is a cross-cutting concern, and this is a justified architectural exception.

> When `src/rbac/` scripts need to access the database, they must do so through the `src/repositories/` layer. Calling `src/db/pool.ts` directly is not allowed.

---

## Development Standards

### Language & Style
- Always use **TypeScript**. Adding `.js` files under `src/` is not allowed.
- Use **ES Modules** (`import` / `export`). Do not use `require`.
- Use **2-space indentation** and **single quotes** `'` for strings.
- Each function should have a single responsibility and ideally not exceed 50 lines.
- Always use **`async/await`**. Avoid `.then()` chains.

```ts
// ✅ Correct
const user = await fetchUser(id);

// ❌ Forbidden
fetchUser(id).then(user => { ... });
```

- Use **Named Exports**. Avoid default exports.

```ts
// ✅ Correct
export const fetchUser = async (id: string): Promise<User> => {
  // implementation
}

// ❌ Forbidden: avoid default exports
export default async function fetchUser(id: string): Promise<User> { ... }
```

### TypeScript Standards
- All function parameters and return values must have explicit type annotations. **`any` is forbidden.**
- Use `interface` for object shapes, and `type` for union types / utility types.

```ts
// ✅ Correct
interface UrlRecord {
  id: number;
  shortCode: string;
  originalUrl: string;
}

type UrlStatus = 'active' | 'expired';

// ❌ Forbidden: use interface for object shapes, use type for union types
type UrlRecord = { id: number; shortCode: string; }  // should use interface
type UrlStatus = string                               // should be explicitly defined as a union type
```

- Enable strict mode (`strict: true`). Do not use forced type casting (`as unknown as X`) to suppress errors.

### Naming Conventions
- File names: `kebab-case.ts` (e.g., `url-controller.ts`, `url-service.ts`)
- Variables / Functions: `camelCase` (e.g., `shortCode`, `createShortUrl`)
- Classes / Interfaces / Types: `PascalCase` (e.g., `UrlRecord`, `CreateUrlDto`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_COUNT`, `DEFAULT_TTL`)

### Enums

- Constants that have actual values at runtime and are shared across modules must be defined as `enum` and placed in the `src/enum/` directory.
- Type definitions that only exist at compile time (`interface`, `type alias`) go in `src/types/`, not `src/enum/`.

```ts
// ✅ Correct: has runtime value → src/enum/
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
}

export enum AuthEvent {
  FORGOT_PASSWORD = 'FORGOT_PASSWORD',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

// ✅ Correct: type only → src/types/
export interface UrlRecord {
  id: number;
  shortCode: string;
}

// ❌ Forbidden: do not put enums in types/, or interfaces in enum/
```

### Data Validation (Zod)
- All external input (request body, query params, environment variables) must be validated using **Zod schemas**.
- Schema definitions go in the `src/schemas/` directory.
- TypeScript types must be derived from Zod schemas (`z.infer<typeof schema>`). Do not write duplicate type definitions by hand.

### Database (PostgreSQL + pg)
- Use **`pg` (node-postgres)** as the database driver.
- The `Pool` instance must be created and exported from `src/db/pool.ts`. Other files must import it from there. Creating a new `Pool` elsewhere is not allowed.
- All DB operations must be in the `src/repositories/` layer. Controllers must not execute queries directly.
- **String-concatenated SQL is forbidden.** Always use parameterized queries (`$1, $2, ...` placeholders).

```ts
// ✅ Correct
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ Forbidden
const result = await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
```

- When a transaction is needed, use `pool.connect()` to obtain a client and manage `BEGIN / COMMIT / ROLLBACK` manually. **`client.release()` must be placed in the `finally` block** to ensure the connection is never leaked regardless of success or failure.

```ts
// ✅ Correct: release in finally, guaranteed to execute
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO urls ...');
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
}
```

- Annotate query result types using generics: `pool.query<UserRow>(...)`. Do not use bare `any`.

### Caching (Redis)
- All Redis operations must be encapsulated in `src/lib/cache.ts`. Calling the Redis client directly elsewhere is not allowed.
- Cache key naming format: `<module>:<identifier>` (e.g., `url:abc123`).
- **TTL must always be specified** when setting a cache entry. Permanent caching is not allowed.
- RBAC permission data must have a TTL (24 hours recommended). When permission data changes, the corresponding Redis cache must be deleted and re-initialized.
- General business queries follow the **Cache-Aside** pattern: query Redis first → query the database only on a Cache Miss → write the result back to Redis. If the query result is empty (data does not exist), do not write to Redis to avoid caching invalid data. RBAC permission data uses an active write pattern (initialized on startup) and does not follow this pattern.
- When performing update or delete operations, always follow the principle of **updating/deleting the database first, then deleting/updating the Redis cache**, to ensure eventual data consistency.

### Error Handling
- **Not every layer needs a `try/catch`.** Each layer's error handling responsibility is as follows:
  - **Repository layer**: No need to catch. Let the original error propagate up naturally.
  - **Service layer**: Catch the error, append operation context to the error message (e.g., `[urlService.createShortUrl] original error message`), then re-throw. This makes it easier to trace the error source during debugging.
  - **Controller layer**: Do not handle errors. Let them propagate up to the error middleware.
  - **Error middleware**: Receives all errors, logs them, and returns a standardized error response.
- Silent catches (`catch (e) {}`) are not allowed. Any caught error must be re-thrown and must not be swallowed.
- **Error logging is the sole responsibility of the error middleware.** Layers must not log errors individually to avoid the same error being recorded multiple times.

### Logging
- **`console.log` is forbidden in production logic.** Always use the project's unified logger (`src/lib/logger.ts`).
- The logger must use appropriate log levels: `logger.info`, `logger.warn`, `logger.error`.
- When an error occurs, always log the full error object. Do not log only the error message string.
- **Never log sensitive user information** (e.g., passwords, full API keys, tokens) via the logger. Verify that error objects do not contain sensitive fields before logging.

### Environment Variables
- Sensitive information (API keys, DB passwords, Redis URLs, etc.) must always be injected via environment variables. Hardcoding is not allowed.
- `.env` must not be committed to version control. Only `.env.example` should be updated when changes are made.

---

## Testing Standards

### General Rules (Vitest)
- Test files go in the `tests/` directory, mirroring the `src/` structure.
- Test file naming: `kebab-case.test.ts` (e.g., `url-service.test.ts`).
- Each test case must clearly describe the scenario being tested. Use `describe` for grouping and `it` for individual cases.
- Tests must cover both the happy path and error paths.
- **Unit tests and service-layer tests**: Must not connect to a real database or Redis. Always use mocks.
- **Integration tests (API routes)**: May connect to a dedicated test database (e.g., testcontainers or a separate test DB). The production database must never be used. The test environment must also have a dedicated Redis instance with RBAC permission data initialized before tests run, or mock the RBAC middleware, to prevent all route tests from failing due to permission validation errors.

### Coverage Requirements
- Follow **TDD (Test-Driven Development)**: write tests before implementing features.
- All new features must have corresponding tests.
- API routes must have **integration tests**.
- The Service layer (`src/services/`) must have **unit tests**. Mock `src/repositories/` and `src/lib/cache.ts` when testing.
- Utility functions (`src/utils/`) must have **unit tests**.
- Infrastructure wrappers (`src/lib/`) must have **unit tests**.
- Permission initialization scripts (`src/rbac/`) must have **unit tests**. Mock `src/repositories/` and `src/lib/cache.ts` when testing.
- The Repository layer (`src/repositories/`) is recommended to be covered indirectly via API route integration tests. If independent validation of complex SQL logic is needed, integration tests may be written for that specific repository using a dedicated test database — do not use mocks.
- Minimum test coverage: **70%**. Submissions below this threshold are not allowed.

### Testing Principles
- Each test must verify **one thing only**. Do not validate multiple behaviors in a single test.
- Test names must clearly describe the scenario (e.g., "should throw an error when the short code already exists").
- Tests must be able to **run independently**, with no dependency on the execution order or results of other tests.

### Example

```ts
describe('url-service', () => {
  describe('createShortUrl', () => {
    it('should successfully create a short URL', async () => {
      // arrange
      const mockUrl = 'https://example.com';
      vi.mocked(urlRepository.create).mockResolvedValue({ id: 1, shortCode: 'abc123' });

      // act
      const result = await urlService.createShortUrl(mockUrl);

      // assert
      expect(result.shortCode).toBe('abc123');
    });

    it('should throw an error when the short code already exists', async () => {
      // arrange
      vi.mocked(urlRepository.findByCode).mockResolvedValue({ id: 1 });

      // act & assert
      await expect(urlService.createShortUrl('https://example.com', 'abc123'))
        .rejects.toThrow('Short code already exists');
    });
  });
});
```

---

## Security Standards

### Strictly Forbidden
- Hardcoding API keys, passwords, or tokens in source code.
- Using `eval()` to execute dynamic code.
- Concatenating SQL queries directly (SQL Injection risk).
- Using unvalidated user input directly.
- Storing URLs with a scheme other than `http://` or `https://` (e.g., `javascript:`, `data:`, `vbscript:` — Open Redirect / XSS risk).

### Required Practices
- All sensitive information must be read from environment variables (`.env`).
- Always use parameterized queries (`$1, $2, ...`).
- All user input must be validated (following the Zod validation rules in the development standards).
- The `originalUrl` scheme must be restricted to `http://` or `https://` (enforced in the Zod schema).
- API routes must have authentication/authorization middleware. Publicly accessible routes (e.g., the short URL redirect endpoint) are exempt from this requirement and must be explicitly marked as public routes at the route layer.
- All API routes must apply **rate limit middleware** (using `express-rate-limit`) to prevent abuse and brute-force attacks.
- Use **helmet** to manage HTTP security headers, initialized once in `src/app.ts`.
- CORS configuration must be managed centrally in `src/app.ts`. Setting it on individual routes is not allowed.

---

## Testing & CI Commands

Before submitting code or completing a task, ensure the following commands all pass:

```bash
# TypeScript type checking
npm run typecheck

# Lint check
npm run lint

# Run all tests
npm test

# Run tests with coverage report
npm run coverage
```

> If typecheck, lint, or test fails, fix the issues before submitting. Skipping is not allowed.

> The development server (`npm run dev`) is for local verification only and is not part of the pre-submission checklist.

> Building (`npm run build`) can be run when you need to verify the output. It is not required before every submission.

---

## Agent Behavior Rules

### ✅ Allowed Actions
- Read and modify files under `src/` and `tests/`.
- Add new files and directories following the project structure.
- Run `npm run typecheck`, `npm test`, `npm run lint`, `npm run dev`, `npm run build`, `npm run coverage`.
- Update `.env.example` (no actual secret values).
- Modify `.gitignore` to ignore new temporary or generated files, but must not remove existing ignore rules (especially `.env`).

### ❌ Forbidden Actions
- **Must not modify** `.env` or any config file containing real secrets.
- **Must not delete** the `tests/` directory or any test files.
- **Must not execute** destructive database operations (e.g., `DROP TABLE`, truncating data, etc.).
- **Must not access Redis directly**, bypassing the `src/lib/cache.ts` encapsulation layer.
- **Must not commit** code containing `console.log` in production logic. Use `src/lib/logger.ts` instead.
- **Must not install** unconfirmed third-party packages. Propose them first and wait for approval.
- **Must not push (`git push`)** to any remote branch unless explicitly instructed to do so.
- **Must not execute SQL to modify the database schema directly.** Instead, provide a complete SQL migration script (e.g., `ALTER TABLE`, `CREATE INDEX`) for the developer to review and execute manually. Scripts must consider backward compatibility — new columns must allow NULL or have a default value to avoid breaking existing data.

### ⚠️ Requires Confirmation Before Acting
- Before modifying core entry files such as `src/app.ts` or `src/index.ts`, explain the reason for the change.
- Before modifying the `src/rbac/` permission initialization scripts, explain the reason for the change. This directory directly affects the global permission data loaded at service startup.
- Before refactoring across multiple modules, list the affected scope first.
- When adding or modifying a Zod schema, verify whether related type derivations need to be updated as well.

### 💬 Communication & Thinking Style

- Before starting any non-trivial task, state your understanding of the requirements and your execution plan before acting.
- When human decisions are required (e.g., architectural choices, unclear requirements, items that need confirmation before acting), use a **one-question-at-a-time** format: ask one question, provide options with the reasoning behind each, and wait for confirmation before proceeding.
- When answering or analyzing a problem, adjust the depth of explanation based on complexity: give a concise summary for simple tasks, and show your thinking process for complex tasks or those involving architectural decisions.

---

## Git Commit Standards

Follow Conventional Commits. The commit message format is as follows:

| Prefix | Purpose |
|--------|---------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Refactoring (no functional change) |
| `test:` | Test-related changes |
| `docs:` | Documentation updates |

### Examples

```
feat: add short URL creation API
fix: fix short URL query returning 404
refactor: refactor url-service query logic
test: add unit tests for url-controller
docs: update AGENTS.md layered architecture section
```

> Do not use scopes (e.g., `feat(auth):`). Keep the format simple.

---

## Pull Request Standards

PR descriptions must include the following three sections:

1. **Summary**: What this PR does
2. **Scope of Impact**: Affected endpoints or file paths
3. **Setup Steps**: Any additional setup required (e.g., DB changes, Redis config, new environment variables)

### Example

```markdown
## Summary
Add short URL creation API with support for custom short codes and expiration time.

## Scope of Impact
- `POST /api/url/create`
- `src/controllers/url-controller.ts`
- `src/services/url-service.ts`
- `src/repositories/url-repository.ts`

## Setup Steps
- No additional setup required
```

### GitHub Settings
- The `main` branch has Branch Protection enabled. **Direct pushes are not allowed.** All changes must be merged via PR.
- Each feature or fix should be developed on its own branch (e.g., `feat/short-url-create`, `fix/redirect-404`) and submitted as a PR when complete.

---

## Performance Requirements

- When adding queries, verify whether the relevant columns are indexed. If not, suggest adding an index.
- API response time **must not exceed 500ms at P95**. Cache-hit requests are expected to respond within 50ms; cold queries (direct DB hits) within 200ms. If exceeded, check for missing indexes or N+1 query issues.

---

## When in Doubt

If you are unsure what to do:

1. Stop — do not guess
2. Ask the user
3. Refer to existing similar implementations in the project

---

## Docker & Nginx

> ⚠️ This section is not yet active. It is for future reference only. The Agent does not need to interact with these configurations at this time.

### Docker
- The containerization config file is `docker-compose.yml` in the root directory.
- Do not modify `docker-compose.yml` on your own. Notify the developer if changes are needed.
- Do not install packages or modify container settings inside the container directly.

### Nginx
- Acts as a reverse proxy, forwarding external requests to the Express service.
- Nginx config file location: to be added.
- Do not modify Nginx config on your own. Notify the developer if changes are needed.

---

## Additional Notes

- If a task requirement is unclear, **proactively ask** rather than making assumptions and proceeding with changes.
- After completing each task, briefly describe what was changed and why.
- If you find potential issues in existing code, flag them, but do not make changes unless explicitly asked to do so.
