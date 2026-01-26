# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript server code (Express app, controllers, routes, middleware, Redis, RBAC, and utilities).
- `uploads/` stores user-uploaded files and is served as static content.
- `table.sql` documents database schema setup.
- `document.md` contains additional project notes.

## Build, Test, and Development Commands
- `npm run dev` — runs the API in development using `nodemon` on `src/index.ts`.
- `npm run build` — compiles TypeScript to `dist/` using `tsc`.
- `npm run start` — runs the compiled server from `dist/index.js` (run after `build`).

## Coding Style & Naming Conventions
- Language: TypeScript + Node.js/Express.
- Indentation: 4 spaces (match existing `src/*.ts` files).
- Naming: `camelCase` for variables/functions, `PascalCase` for types/classes, files use lowercase with dots (e.g., `link.controllers.ts`).
- No formatter or linter is configured; keep changes small and follow existing patterns.

## Testing Guidelines
- No test runner or test scripts are currently configured.
- If you add tests, include a script in `package.json` and place tests under a `tests/` or `__tests__/` folder with `*.test.ts` or `*.spec.ts` names.

## Commit & Pull Request Guidelines
- Recent commits use bracketed status tags in Chinese, e.g., `[完成] auth/resetPassword`, `[未完成] 2fa驗證相關程式碼`.
- Follow that pattern for consistency: `[完成] <area/feature>` or `[未完成] <area/feature>`.
- PRs should include: a short summary, affected endpoints/paths, and any needed setup steps (e.g., DB/Redis requirements).

## Configuration & Runtime Notes
- Environment variables are loaded from `.env`; keep secrets out of commits.
- The server serves static uploads from `/static` (backed by `uploads/`).
- The app expects PostgreSQL and Redis to be available before startup (see `src/index.ts`).


# Code Review Agent Rules

This document defines the default behavior and workflow for Code Review tasks.
The goal is to ensure safe, consistent, and high-quality static analysis without
introducing any side effects to the repository.

---

## Default behavior

- The agent is allowed to READ files in this repository in read-only mode.
- The agent MUST NOT modify, create, or delete any file unless the user explicitly says:
  "approve write".
- The agent MUST NOT run any command that executes code or changes system state,
  including but not limited to:
  npm, pnpm, node, test, build, migration, git, curl, or any external network access.
- The agent MUST perform static analysis only.

---

## Code Review workflow

When the user asks for "code review", "review", or similar requests:

1. Read the relevant files in read-only mode.
    - Suggested order: controller → service → repo → utils.
2. Perform a review focusing on:
    - Readability
    - Maintainability
    - Performance
    - Security (especially auth, 2FA, token, permission-related logic)
3. If additional context is required, read other related files in read-only mode.
    - Do not ask the user to paste code unless file access is not available.
4. Output the review using the fixed Markdown structure defined below.

---

## Review output structure (fixed)

All Code Review outputs MUST follow this structure:

- ## TL;DR（最重要 5 點）
- ## High risk issues（安全或資料風險，需說明影響與建議方向）
- ## Bugs / Logic issues（可能的 bug 或邏輯問題）
- ## Design / Architecture（架構與模組切分建議）
- ## Consistency / Style（命名、錯誤處理、logging、typing）
- ## Actionable checklist（可直接執行的待辦事項，使用 `- [ ]`）

Each issue SHOULD reference concrete file paths and function or code locations
(e.g., `src/controller/user.controllers.ts`, `enable2fa()`).

---

## Output language and formatting

- All Code Review outputs MUST be written in Traditional Chinese (zh-TW).
- Technical terms MUST remain in English, including but not limited to:
    - File paths
    - Function names
    - Variable names
    - Class names
    - Identifiers and symbols
- Code blocks MUST preserve the original source code and MUST NOT be translated
  or paraphrased.
- The tone should be professional, concise, and suitable for long-term documentation.

---

## Saving review results

When the user says one of the following:
- "save review"
- "persist this review"
- "write review"

Then the agent MUST:

1. Use the most recent Code Review content from the current session.
2. Prepare a Markdown file under the following directory:
   `docs/code-review/`
3. Filename format:
   `CR-<scope>-<YYYY-MM-DD>-<Version>.md`

   Where:
    - `<Version>` MUST follow the format: `vNN` (e.g., `v01`, `v02`, `v03`).
    - Version numbering starts from `v01` for the same `<scope>` and date.
    - The agent MUST NOT automatically infer or increment the version number.
    - If the version is not explicitly specified by the user,
      the agent MUST ask the user to provide it before proceeding.
4. Show the full file path and a brief content summary BEFORE writing.
5. Write the file ONLY after the user explicitly replies:
   `"approve write"`.
6. Do NOT modify, create, or delete any other files.

---

## Session handling

- When the user says "reset session", the agent should start a new session
  and MUST NOT carry over any previous conversation context.

