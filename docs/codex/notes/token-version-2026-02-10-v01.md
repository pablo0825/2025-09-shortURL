# token_version 方案討論（2026-02-10 v01）

## 目標
- 在無法取得目標使用者 access token 原文的前提下，讓高風險操作（例如 `resetUser2FA`、`deactivateUser`）可以讓舊 access token 立即失效。

## 核心做法
1. `users` 增加 `token_version` 欄位（預設 `0`）。
2. 發行 access token 時，把 `token_version` 放進 JWT claims。
3. `authenticate` 驗證 access token 後，比對 claims 內版本與 DB 當前版本。
4. 若版本不一致，直接回 `401`。
5. 在高風險操作時執行 `token_version = token_version + 1`，使既有 access token 全部失效。

## 驗證流程（請求進來時）
1. 驗證 token 簽章與過期時間。
2. 讀取 claims：`id`、`role`、`token_version`。
3. 查 `users` 目前 `token_version`（可同時檢查 `is_active`）。
4. 比對版本：
- 相同：放行。
- 不同：拒絕（token 過期/失效語意）。

## 需要改動的檔案
1. `src/table.sql`
- 新增 `users.token_version INT NOT NULL DEFAULT 0`。

2. `src/zod/jwt.schema.ts`
- `AccessPayloadSchema` 新增 `token_version`。
- 建議同步把 `role` enum 對齊目前實際角色（`admin` / `assistant` / `user`）。

3. `src/utils/jwtProvider.ts`
- `AccessClaims` 型別加入 `token_version`。
- `generateAccessToken` payload 會由 zod 保證格式。

4. `src/controller/auth.controllers.ts`
- `login`：查 user 時讀出 `token_version`，發 access token 帶入。
- `login2fa`：同上。
- `refresh`：發新 access token 前重新讀 `token_version` 並帶入。

5. `src/middleware/authenticateTokents.ts`
- 解析 claims 的 `token_version`。
- 查 DB 比對版本，不一致直接 `401`。

## 建議同步修改（強烈建議）
1. `src/controller/admin.controllers.ts`
- `resetUser2FA`：在 `UPDATE users` 同步 `token_version = token_version + 1`。
- `deactivateUser`：同樣遞增 `token_version`。

2. `src/controller/auth.controllers.ts`
- `resetPassword`：建議也遞增 `token_version`，讓密碼重設後舊 token 立即失效。

## 上線順序建議
1. 先部署 DB 欄位（`token_version`）。
2. 再部署發 token 與驗 token邏輯。
3. 最後部署高風險操作中的版本遞增。

## 相容性注意
- 若系統中仍有舊 token（不含 `token_version`），需決定過渡策略：
- 策略 A：立即視為無效（安全優先）。
- 策略 B：短暫相容（需額外 fallback，之後再移除）。

## 風險與限制
- `authenticate` 每次多一次版本比對查詢，需注意效能（可後續加快取）。
- 這是全帳號層級失效，不是單裝置層級；若要精細控管，需搭配 `session_id` 驗證。

## 測試清單（最小）
1. `login`/`refresh` 發出的 token 含 `token_version`。
2. `resetUser2FA` 後，舊 access token 立即被 `401`。
3. `deactivateUser` 後，舊 access token 立即被 `401`。
4. `resetPassword`（若有做版本遞增）後，舊 access token 立即被 `401`。
5. 版本一致時，正常請求可通過 `authenticate`。
