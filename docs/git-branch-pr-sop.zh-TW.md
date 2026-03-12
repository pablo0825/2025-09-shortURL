# Git Branch / PR / Merge SOP

本文件依據根目錄 [AGENTS.md](/C:/Users/owner/Documents/project/2025-09-shortURL/AGENTS.md) 整理，說明此專案從 `main` 開分支開發，到透過 Pull Request 合併回 `main` 的標準流程。

## 適用原則

- `main` 啟用 Branch Protection，不可直接 push。
- 每個功能或修正都必須在獨立分支開發。
- 所有變更都必須透過 Pull Request 合併回 `main`。
- Commit message 必須遵守 Conventional Commits。
- 合併前必須通過 typecheck、lint、test、coverage。

## SOP

### 1. 同步最新 `main`

開始開發前，先確保本機 `main` 與遠端一致。

```bash
git checkout main
git pull origin main
```

### 2. 從 `main` 建立功能分支

依需求類型建立分支，名稱需清楚表達用途。

功能開發範例：

```bash
git checkout -b feat/short-url-create
```

Bug 修正範例：

```bash
git checkout -b fix/redirect-404
```

### 3. 在功能分支上開發

開發期間需遵守專案既有規範，包含但不限於：

- 分層架構：`Route -> Controller -> Service -> Repository -> Database`
- 新增功能需補對應測試
- 不可直接修改正式環境敏感設定
- 不可直接將變更推送到 `main`

### 4. 完成後執行提交前檢查

提交前必須確認以下指令全部通過：

```bash
npm run typecheck
npm run lint
npm test
npm run coverage
```

### 5. 建立 Commit

Commit message 必須符合 Conventional Commits，且不使用 scope。

範例：

```bash
git add .
git commit -m "feat: add short URL creation API"
```

可用前綴：

- `feat:`
- `fix:`
- `refactor:`
- `test:`
- `docs:`

### 6. 推送功能分支到遠端

```bash
git push origin feat/short-url-create
```

### 7. 建立 Pull Request 到 `main`

PR 目標分支必須是 `main`，且描述必須包含以下三段：

- `Summary`
- `Scope of Impact`
- `Setup Steps`

範例：

```md
## Summary
Add short URL creation API.

## Scope of Impact
- POST /api/url/create
- src/controllers/url-controller.ts
- src/services/url-service.ts
- src/repositories/url-repository.ts

## Setup Steps
- No additional setup required
```

### 8. 若 `main` 有新變更，先同步並解衝突

如果 PR 送出前或 review 期間 `main` 已更新，先把最新 `main` 合回功能分支。

```bash
git checkout main
git pull origin main
git checkout feat/short-url-create
git merge main
```

如有衝突，解完後需重新執行提交前檢查：

```bash
npm run typecheck
npm run lint
npm test
npm run coverage
```

### 9. 等待 Review 與 CI 通過

因 `main` 有 Branch Protection，只有在 review 與 CI 都符合要求後，才可進行合併。

### 10. 透過 Pull Request 合併回 `main`

合併應在 GitHub 或對應 Git 平台的 PR 介面完成，不應以本機直接 push 方式更新 `main`。

### 11. 合併後清理本地分支

```bash
git checkout main
git pull origin main
git branch -d feat/short-url-create
```

## 快速檢查清單

- 是否從最新的 `main` 開分支
- 是否使用獨立功能分支開發
- 是否完成必要測試與檢查
- Commit message 是否符合 Conventional Commits
- PR 是否包含 `Summary`、`Scope of Impact`、`Setup Steps`
- 是否透過 PR 而非 direct push 合併到 `main`
