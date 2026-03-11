# 程式碼審查：問題優先排序清單

> 日期：2026-03-11
> 審查方式：資深後端工程師角度，嚴格檢視
> 處理原則：先確保系統行為正確（Bug），再提升效能，接著修補安全隱患，最後處理架構與一致性

---

## 優先排序總覽

| 優先級 | 類別 | 問題 | 位置 |
|--------|------|------|------|
| P0 | Bug | `ttl === 0` fall-through 導致 Cron 無窮錯誤循環 | `src/task/link-tasks-to-cache-task.ts` |
| P1 | 效能 | Cache-Hit 路徑對已驗證 URL 重複做 DNS 查詢 | `src/services/link/link-service.ts` |
| P2 | 效能 | Refresh Token O(n) bcrypt compare 在 Transaction 內 | `src/services/auth/auth-service.ts` |
| P3 | 效能 | `LongUrlSchema` 在 Controller 與 Service 各自建立一次 | `src/controllers/link-controllers.ts`, `src/services/link/link-service.ts` |
| P4 | 安全 | `listLinks` 缺少 `creator_user_id` 過濾（潛在資料洩漏） | `src/repositories/link/link-repository.ts` |
| P5 | 安全 | Admin 角色完全跳過 Permission Check（行為無法稽核） | `src/middlewares/auth/check-permission.ts` |
| P6 | 安全 | `isForbiddenTarget` 存在 DNS Rebinding 攻擊窗口 | `src/lib/is-forbidden-target.ts` |
| P7 | 架構 | `user-security-service.ts` 直接 import `pool` 並管理 Transaction | `src/services/user/user-security-service.ts` |
| P8 | 架構 | Cron Task 直接執行 SQL，繞過 Repository 層 | `src/task/tasks.ts` |
| P9 | 架構 | `withTransaction` 定義在 `auth-repository.ts`，位置語意錯誤 | `src/repositories/auth/auth-repository.ts` |
| P10 | 架構 | `src/queries.ts` 空殼遺留檔案 | `src/queries.ts` |
| P11 | 一致性 | API Response 錯誤格式不統一（`error` / `err` / `message` 混用） | `src/controllers/link-controllers.ts` 等 |
| P12 | 一致性 | `jwtProvider` / `redisProvider` 使用 Class，風格與專案不符 | `src/utils/jwt-provider.ts`, `src/utils/redis-provider.ts` |
| P13 | 一致性 | 兩套錯誤包裝函式並存（`toAppError` vs `wrapServiceError`） | `src/utils/app-error.ts`, `src/services/user/user-security-service.ts` |
| P14 | 一致性 | `cacheSetNoTtl` 違反「永久快取禁止」原則 | `src/lib/cache.ts` |

---

## P0 — Bug（立即修復）

### `ttl === 0` fall-through 導致 Cron 無窮錯誤循環

**位置：** `src/task/link-tasks-to-cache-task.ts:106-122`

**問題描述：**

當短網址已過期（`ttl === 0`）時，程式刪除 Redis 快取並更新 DB 狀態為 `done` 後，**缺少 `continue`**，導致程式繼續往下執行，呼叫 `cacheSet(key, url, 0)`。由於 `cacheSet` 強制要求 `ttl > 0`，此處必定拋出例外，觸發 retry 邏輯，不斷循環直到達到 `attempts` 上限，最終以 `failed` 結束。

**問題程式碼：**

```typescript
if (ttl === 0) {
    await cacheDel(key);
    await client.query('UPDATE link_task SET status = $1 ...');
    // ❌ 缺少 continue，程式繼續往下執行
}

const url = String(long_url);
if (ttl === null) {
    await cacheSet(key, url, DEFAULT_SHORT_CACHE_TTL_SECONDS);
} else {
    await cacheSet(key, url, ttl); // ← ttl = 0，cacheSet 拋出例外
}
```

**影響：** 每次有短網址過期都會觸發。Cron 任務（每 10 分鐘執行一次）會持續對已過期的連結產生失敗紀錄，直到 attempts 耗盡。

**修復方向：** 在更新 DB 狀態後加入 `continue`，跳過後續的 `cacheSet` 邏輯。

---

## P1 — 效能（高頻路徑，影響最大）

### Cache-Hit 路徑對已驗證 URL 重複做 DNS 查詢

**位置：** `src/services/link/link-service.ts:137-144`

**問題描述：**

短網址重定向是整個系統**最高頻的 API 路徑**。Cache-Hit 路徑的目標是 < 50ms，但目前從 Redis 拿到 URL 後，仍會呼叫 `resolveAllowedLongUrl`，對 hostname 進行 Zod parse + `isForbiddenTarget`（DNS lookup），完全消除了 Cache 帶來的效能優勢。

快取中的 URL 本身就是從 DB 撈出的已驗證資料，不需要再次驗證。

**問題程式碼：**

```typescript
const cached = await cacheGet(key);
if (cached) {
    const resolvedCached = await resolveAllowedLongUrl(cached); // ← DNS lookup，不必要
    if (resolvedCached.ok && resolvedCached.longUrl) {
        return { status: 'found', longUrl: resolvedCached.longUrl };
    }
    await cacheDel(key);
}
```

**影響：** 所有 Cache-Hit 請求都多一次 DNS 查詢（數十至數百毫秒），P95 回應時間無法達到 < 50ms 的目標。

**修復方向：** Cache-Hit 時直接回傳快取的 URL，不做二次驗證。僅在 Cache-Miss 時（從 DB 撈出後）進行 `isForbiddenTarget` 驗證，通過才寫入快取。

---

## P2 — 效能

### Refresh Token O(n) bcrypt compare 在 Transaction 內

**位置：** `src/services/auth/auth-service.ts:412-424`

**問題描述：**

`/api/auth/refresh` 的邏輯在一個 DB Transaction 內，對最多 10 個 Refresh Token 逐一做 `bcrypt.compare`。bcrypt 是刻意設計成慢的演算法（每次約 300ms），最壞情況下（10 個 token 均不匹配）需要約 **3 秒**，整段時間 DB connection 都被佔用，嚴重影響 connection pool 的可用性。

**問題程式碼：**

```typescript
return await withTransaction(async (client) => {
    const tokens = await findActiveRefreshTokensByUserId(userId, 10, client);
    for (const token of tokens) {
        // 每次 ~300ms，10 個 = 最長 3 秒，全程佔用 DB connection
        const isMatch = await bcrypt.compare(refreshToken, token.refresh_token_hash);
        if (isMatch) { matched = token; break; }
    }
    // ... 後續還有多個 DB 操作
});
```

**修復方向：** 在 JWT Refresh Token 的 payload 中加入 `jti`（JWT ID），儲存到 DB 時以 `jti` 為索引欄位。刷新時直接用 `jti` 查出對應的單一 hash，做一次 bcrypt.compare 即可，從 O(n) 降為 O(1)，且可在 Transaction 外完成 compare。

---

## P3 — 效能

### `LongUrlSchema` 在 Controller 與 Service 各自建立一次

**位置：** `src/controllers/link-controllers.ts:13`、`src/services/link/link-service.ts:17`

**問題描述：**

相同選項的 Zod schema 在模組載入時被建立兩次。更根本的問題是：Controller 已對輸入做過完整的 Zod 驗證，Service 的 `createShortUrlService` 不應重複驗證同一份資料，這違反了分層職責原則。

**影響：** 輕微效能浪費，以及邏輯重複（兩層都在做 URL 驗證）。

**修復方向：** Schema 抽到共用位置（如 `src/schemas/link-schema.ts`）統一匯出。Service 層不重複驗證已由 Controller 驗證過的輸入；`isForbiddenTarget` 的呼叫保留在 Service 層（因為這是業務邏輯），但 Zod parse 不需要重複。

---

## P4 — 安全

### `listLinks` 缺少 `creator_user_id` 過濾（潛在資料洩漏）

**位置：** `src/repositories/link/link-repository.ts:148-163`

**問題描述：**

`GET /api/link/` 設計上是「取得我的連結列表」，但 SQL 沒有加上 `WHERE creator_user_id = ?` 過濾。任何擁有 `link:list` 權限的使用者都能看到系統中所有人建立的短網址。

**問題程式碼：**

```sql
SELECT id::text, code, long_url, created_at, expire_at, is_active,
       COUNT(*) OVER() AS total_count
FROM links
WHERE ($3::boolean OR expire_at > now())
  AND ($4::boolean OR is_active = TRUE)
-- ❌ 缺少 AND creator_user_id = $5
ORDER BY created_at DESC
LIMIT $1 OFFSET $2
```

**影響：** 若系統內有多個使用者，任一使用者可以列出其他人的短網址（包含對應的 long URL）。

**修復方向：** `listLinks` 加入 `userId` 參數，SQL 加上 `AND creator_user_id = $N`，並在 Service 與 Controller 層傳入 `req.user.id`。

---

## P5 — 安全

### Admin 角色完全跳過 Permission Check（行為無法稽核）

**位置：** `src/middlewares/auth/check-permission.ts:19`

**問題描述：**

當使用者角色為 `admin` 時，middleware 直接放行，完全不查 Redis 中的實際權限設定。這導致：

1. DB 中為 admin 設定的權限資料毫無作用
2. 無法透過 RBAC 機制限制特定 admin 的操作範圍
3. 稽核日誌無法判斷「此 admin 是否有此權限」

**問題程式碼：**

```typescript
if (userRole === 'admin') {
    return next(); // ← 無條件放行，跳過所有 RBAC 檢查
}
```

**影響：** Admin 的行為超出 RBAC 系統的管理範圍，與系統設計意圖不符。

**修復方向：** 視設計意圖而定。若 admin 確實應擁有所有權限，應在 RBAC 初始化時為 admin 角色寫入所有權限，並走同一套檢查流程。若 admin 應受限，則移除此 bypass，改為在權限設定上控制。

---

## P6 — 安全

### `isForbiddenTarget` 存在 DNS Rebinding 攻擊窗口

**位置：** `src/lib/is-forbidden-target.ts`

**問題描述：**

DNS 查詢的時間點與實際發出 HTTP 請求的時間點之間存在間隔（Time-of-Check to Time-of-Use，TOCTOU）。攻擊者可以控制一個 DNS TTL 極短的域名，在驗證時解析為公網 IP（通過檢查），在實際請求時切換為內網 IP（繞過防護），即所謂的 **DNS Rebinding 攻擊**。

**影響：** 理論上可利用短網址服務作為 SSRF 跳板，訪問內網服務。實際利用難度較高，屬於進階攻擊向量。

**修復方向：** 可搭配維護一份靜態的內網 IP 範圍黑名單（直接比對 IP），或在 HTTP 請求層（如 Nginx / Proxy）加上出口過濾，雙層防禦降低風險。

---

## P7–P10 — 架構違規

> 架構問題不影響系統當前行為，但會讓程式碼越來越難測試與維護。排序依據：**影響範圍廣的先處理，純粹位置問題的最後處理。**

### P7：`user-security-service.ts` 直接 import `pool` 並管理 Transaction

**位置：** `src/services/user/user-security-service.ts`

**原因排 P7（架構最優先）：** 這個檔案涵蓋頭像、2FA、帳號刪除等多個核心功能。Service 直接碰 `pool` 導致這些功能的單元測試無法正常 mock repository，是影響範圍最廣的架構問題。

**修復方向：** 將 `pool.connect()` / `BEGIN` / `COMMIT` / `ROLLBACK` 的管理邏輯移至 Repository 層，透過 `withTransaction` 封裝。Service 層僅呼叫 Repository 函式。

---

### P8：Cron Task 直接執行 SQL，繞過 Repository 層

**位置：** `src/task/tasks.ts:13`

**原因排 P8：** 雖然只有一條 SQL，但這是每天定時執行的核心維運任務，將 SQL 移到 Repository 層能確保所有 DB 操作都有一致的可追蹤性。

**問題程式碼：**

```typescript
// ❌ 直接對 pool 執行 SQL
const result = await pool.query(
    'UPDATE links SET is_active = FALSE WHERE expire_at < now() AND is_active = TRUE;'
);
```

**修復方向：** 將此 SQL 移至 `src/repositories/link/link-repository.ts`，封裝為 `deactivateExpiredLinks()` 函式，Cron Task 呼叫該函式。

---

### P9：`withTransaction` 定義在 `auth-repository.ts`，位置語意錯誤

**位置：** `src/repositories/auth/auth-repository.ts:65`

**原因排 P9：** 純粹是放錯位置，不影響執行。但若其他 Repository 需要 `withTransaction`，就得 import `auth-repository`，語意上混亂。

**修復方向：** 移至 `src/db/transaction.ts`（或 `src/db/pool.ts`），獨立匯出。

---

### P10：`src/queries.ts` 空殼遺留檔案

**位置：** `src/queries.ts`

**原因排最後：** 整個檔案只有一行注解，無任何實作。直接刪除即可，不需要任何替代方案。

---

## P11–P14 — 設計一致性

> 設計一致性問題不影響系統正確性，但影響程式碼可讀性與長期維護成本。

### P11：API Response 錯誤格式不統一

**位置：** `src/controllers/link-controllers.ts` 等

同一個 Controller 中混用 `error`、`err`、`message` 三種錯誤欄位名稱，API 使用者無法依賴一致的欄位。

**修復方向：** 統一使用 `{ ok: false, error: string }` 格式，全域搜尋替換。

---

### P12：`jwtProvider` / `redisProvider` 使用 Class，風格與專案不符

**位置：** `src/utils/jwt-provider.ts`、`src/utils/redis-provider.ts`

整個專案使用 Named Export 函式，僅這兩個檔案使用 Class。更嚴重的是，它們在每個使用的地方都被 `new` 一次，重複讀取 env 變數。

**修復方向：** 改為 singleton pattern 或直接改寫為 named export 函式，統一風格。

---

### P13：兩套錯誤包裝函式並存

**位置：** `src/utils/app-error.ts`（`toAppError`）、`src/services/user/user-security-service.ts`（`wrapServiceError`）

功能幾乎相同，卻有兩套實作，增加維護負擔。

**修復方向：** 統一使用 `toAppError`，將 `wrapServiceError` 的名稱對應邏輯（`getMappedStatusCode`）若有需要可整合至 `AppError` 本身。

---

### P14：`cacheSetNoTtl` 違反「永久快取禁止」原則

**位置：** `src/lib/cache.ts:52`

CLAUDE.md 明定「永久快取不允許，設定快取時必須指定 TTL」，但 `cacheSetNoTtl` 的存在本身就是一個缺口。

**修復方向：** 確認目前是否有任何呼叫端，若無則直接刪除此函式；若有，評估是否可改用帶 TTL 的版本。

---

## 附錄：已排除的問題

| 問題 | 排除原因 |
|------|---------|
| `handle-password-reset-failure.ts` 從未被呼叫 | 已改用 `express-rate-limit` 取代，功能覆蓋等同，檔案本身可視情況清理 |

---

## 執行紀錄

> 執行日期：2026-03-11
> 分支：`fix/code-review-issues`
> Commit 數量：2
> 測試結果：**353 passed，0 failed**，0 typecheck errors，0 lint errors

---

### Commit 1 — P0, P1, P4, P5, P8, P9, P10, P11, P13, P14

| 優先級 | 狀態 | 修改檔案 | 說明 |
|--------|------|---------|------|
| P0 | ✅ 完成 | `src/task/link-tasks-to-cache-task.ts` | 加上 `continue`，修復 `ttl === 0` fall-through bug |
| P1 | ✅ 完成 | `src/middlewares/redirect/cache-short-url.ts`<br>`src/services/link/link-service.ts` | 移除 cache-hit 路徑的 Zod + DNS 重複驗證，直接重定向 |
| P4 | ✅ 完成 | `src/routes/link-route.ts`<br>`src/repositories/link/link-repository.ts`<br>`src/controllers/link-controllers.ts`<br>`src/services/link/link-service.ts` | Link 路由補上 `authenticate`；`listLinks` 加入 `creator_user_id` 使用者隔離過濾；建立連結時儲存 `creator_user_id` |
| P5 | ✅ 完成 | `src/middlewares/auth/check-permission.ts` | 移除 admin 跳過 RBAC 的 bypass，所有角色走同一套 Redis 權限檢查 |
| P8 | ✅ 完成 | `src/task/tasks.ts`<br>`src/repositories/link/link-repository.ts` | CRON-01 的 SQL 移至 `deactivateExpiredLinks()` repository 函式 |
| P9 | ✅ 完成 | `src/db/transaction.ts` ⭐ 新增<br>`src/repositories/auth/auth-repository.ts` | `withTransaction` 移至 `src/db/transaction.ts`；`auth-repository.ts` 保留 re-export |
| P10 | ✅ 完成 | `src/queries.ts` ⭐ 刪除 | 空殼遺留檔案直接刪除 |
| P11 | ✅ 完成 | `src/controllers/link-controllers.ts` | 統一 response 格式：錯誤欄位改為 `error`，成功訊息改為 `message` |
| P13 | ✅ 完成 | `src/services/user/user-security-service.ts` | 移除本地 `wrapServiceError` / `getMappedStatusCode`；統一使用 `toAppError`；named Error 模式改為 `AppError` 實例 |
| P14 | ✅ 完成 | `src/lib/cache.ts` | 移除未被使用且違反規範的 `cacheSetNoTtl` |

**同步修正的測試檔案：**
- `tests/middlewares/cache-short-url.test.ts` — 修正既有 2 個測試失敗（移除從未實作功能的斷言）
- `tests/routes/link-route.test.ts` — 補上 `authenticate` mock
- `tests/controllers/link-controllers.test.ts` — 補上 `req.user` 與更新 service 呼叫參數
- `tests/services/link-service.test.ts` — 更新 cache-hit 測試與 userId 傳遞
- `tests/lib/cache.test.ts` — 移除 `cacheSetNoTtl` 測試
- `tests/services/user-security-service.test.ts` — 更新錯誤斷言（改為 `AppError` statusCode）

---

### Commit 2 — P2, P6, P7

| 優先級 | 狀態 | 修改檔案 | 說明 |
|--------|------|---------|------|
| P2 | ✅ 完成 | `database/migrations/add-jti-to-refresh-token.sql` ⭐ 新增<br>`src/utils/jwt-provider.ts`<br>`src/repositories/auth/auth-repository.ts`<br>`src/services/auth/auth-service.ts` | `generateRefreshToken` 改回傳 `{ token, jti }`；`insertRefreshToken` 儲存 jti；新增 `findActiveRefreshTokenByJti` O(1) 查詢；`refreshService` / `logoutService` 的 bcrypt.compare 移至 transaction 外 |
| P6 | ✅ 完成 | `src/lib/is-forbidden-target.ts` | 加入 raw IP 靜態檢查（hostname 為 IP 時不做 DNS 查詢）；補充 DNS Rebinding 限制說明注解 |
| P7 | ✅ 完成 | `src/services/user/user-security-service.ts` | 移除 `import { pool }`；5 個服務函式（頭像更新/刪除、2FA 啟用/停用、帳號軟刪除）全部改用 `withTransaction` |

**同步修正的測試檔案：**
- `tests/services/user-security-service.test.ts` — 更新 mock 方式（`pool` → `withTransaction`）

---

### 未處理項目

| 優先級 | 說明 | 原因 |
|--------|------|------|
| P3 | `LongUrlSchema` 在 Controller / Service 重複建立 | P1 修復後影響已極小，剩餘的 DB-hit 路徑驗證作為安全防線保留，可獨立排期 |
| P12 | `jwtProvider` / `redisProvider` 使用 Class | 重構範圍大，需確保所有呼叫端一致更新，建議獨立 PR |

---

### 部署注意事項

> **P2 需要手動執行 DB Migration（部署前）：**
> ```
> database/migrations/add-jti-to-refresh-token.sql
> ```
> 執行後，現有 refresh token（無 jti 欄位）將全數失效，使用者需重新登入一次。新 token 起將自動帶有 jti。

> **P5 部署前確認：**
> 確認 `admin` 角色在 DB 中已正確設定所有所需權限（透過 `role_permissions` 表），否則 admin 操作將被 RBAC 攔截。
