# AGENTS.md

> 本文件提供給 AI Coding Agent（如 Claude Code、Codex 等）閱讀，
> 說明專案結構、開發規範與操作限制，請在執行任何任務前先完整閱讀。

---

## 專案概覽

本專案為一個**短網址後端 API 服務**，負責短網址的建立、查詢與跳轉，使用 Node.js + Express 處理請求，PostgreSQL 儲存網址資料，Redis 快取熱門短網址以提升查詢效能。

### 技術棧

| 類別 | 技術 |
|------|------|
| 執行環境 | Node.js |
| 語言 | TypeScript |
| 框架 | Express |
| 資料庫 | PostgreSQL |
| 快取 | Redis |
| 資料驗證 | Zod |
| 測試框架 | Vitest |
| Rate Limiting | express-rate-limit |
| Security Headers | helmet |
| 反向代理 | Nginx |
| 容器化 | Docker |

---

## 環境準備

首次設定專案時，執行以下指令安裝依賴：

```bash
npm install
```

---

## 專案結構

```
.
├── src/
│   ├── routes/          # Express 路由定義
│   ├── controllers/     # 請求處理，呼叫 service 層
│   ├── middlewares/     # 中介層（驗證、錯誤處理等）
│   ├── db/              # 資料庫連線設定（pool.ts）
│   ├── repositories/    # PostgreSQL 查詢封裝
│   ├── services/        # 業務邏輯
│   ├── schemas/         # Zod schema 定義
│   ├── types/           # 自訂 TypeScript 型別 / interface
│   ├── lib/             # 基礎設施封裝（第三方服務 wrapper，不含業務邏輯，如 cache.ts、logger.ts）
│   ├── utils/           # 通用工具函式（不含業務邏輯）
│   └── app.ts           # Express 應用程式入口
├── tests/               # 測試檔案（對應 src/ 結構）
├── specs/               # 專案方向與背景文件（供開發者參考，Agent 不需讀取）
├── database/
│   └── schema.sql       # 建表 SQL（手動維護）
├── .env.example         # 環境變數範本（不含敏感資料）
├── docker-compose.yml   # Docker 容器編排設定
├── tsconfig.json
├── package.json
└── AGENTS.md
```

> 若新增檔案，請遵循上述目錄結構放置，不要在根目錄隨意建立新資料夾。

> 檔案放置判斷原則：有外部依賴或 I/O 操作（如 Redis、logging 套件）的封裝放 `src/lib/`；純運算、不依賴外部服務的工具函式放 `src/utils/`。

---

## 分層架構

嚴格遵循以下順序，不得跨層呼叫：

```
Route → Controller → Service → Repository → Database
```

| 層級 | 職責 |
|------|------|
| **Route** | 定義 API 路徑與 middleware，不包含商業邏輯 |
| **Controller** | 處理 Request / Response，呼叫 Service，不可直接存取資料庫 |
| **Service** | 核心商業邏輯，不得依賴任何 HTTP 物件（`req`、`res`） |
| **Repository** | 僅包含資料庫操作，不含商業邏輯 |
| **Database** | PostgreSQL 資料庫，透過 `src/db/pool.ts` 連線 |

> **Redis 快取**統一封裝在 `src/lib/cache.ts`，職責為基礎設施封裝，不含業務邏輯。由 Service 層在需要時呼叫，不屬於 Repository 層。

---

## 開發規範

### 語言與風格
- 一律使用 **TypeScript**，不允許在 `src/` 新增 `.js` 檔案。
- 使用 **ES Modules**（`import` / `export`），不使用 `require`。
- 縮排使用 **2 個空格**，字串統一使用**單引號** `'`。
- 每個函式職責單一，建議不超過 50 行。
- 一律使用 **`async/await`**，避免 `.then()` 鏈。

```ts
// ✅ 正確
const user = await fetchUser(id);

// ❌ 禁止
fetchUser(id).then(user => { ... });
```

- 使用**具名匯出（Named Export）**，避免預設匯出（Default Export）。

```ts
// ✅ 正確
export const fetchUser = async (id: string): Promise<User> => {
  // implementation
}

// ❌ 禁止：不使用具名匯出
export default async function fetchUser(id: string): Promise<User> { ... }
```

### TypeScript 規範
- 所有函式參數與回傳值必須明確標註型別，**禁止使用 `any`**。
- 物件結構使用 `interface`，聯合型別 / 工具型別使用 `type`。

```ts
// ✅ 正確
interface UrlRecord {
  id: number;
  shortCode: string;
  originalUrl: string;
}

type UrlStatus = 'active' | 'expired';

// ❌ 禁止：物件結構應使用 interface，聯合型別應使用 type
type UrlRecord = { id: number; shortCode: string; }  // 應改用 interface
type UrlStatus = string                               // 應明確定義為聯合型別
```

- 啟用嚴格模式（`strict: true`），不得為消除錯誤而強制轉型（`as unknown as X`）。

### 命名規範
- 檔案名稱：`kebab-case.ts`（如 `url-controller.ts`、`url-service.ts`）
- 變數 / 函式：`camelCase`（如 `shortCode`、`createShortUrl`）
- 類別 / Interface / Type：`PascalCase`（如 `UrlRecord`、`CreateUrlDto`）
- 常數：`UPPER_SNAKE_CASE`（如 `MAX_RETRY_COUNT`、`DEFAULT_TTL`）

### 資料驗證（Zod）
- 所有外部輸入（Request body、query params、環境變數）一律使用 **Zod schema** 驗證。
- Schema 定義統一放在 `src/schemas/` 目錄。
- TypeScript 型別從 Zod schema 推導（`z.infer<typeof schema>`），不重複手寫相同型別。

### 資料庫（PostgreSQL + pg）
- 使用 **`pg`（node-postgres）** 作為資料庫驅動。
- `Pool` 實例統一在 `src/db/pool.ts` 建立並匯出，其他地方 import 使用，不得各自建立新的 `Pool`。
- 所有 DB 操作集中在 `src/repositories/` 層，controller 不得直接執行 query。
- **禁止字串拼接 SQL**，一律使用參數化查詢（`$1, $2, ...` 佔位符）。

```ts
// ✅ 正確
const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ 禁止
const result = await pool.query(`SELECT * FROM users WHERE id = ${userId}`);
```

- 需要交易（Transaction）時，使用 `pool.connect()` 取得 client 並手動管理 `BEGIN / COMMIT / ROLLBACK`，**`client.release()` 必須放在 `finally` 區塊**，確保無論成功或失敗都不會洩漏 connection。

```ts
// ✅ 正確：release 放在 finally，確保一定執行
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

- 查詢結果型別透過泛型標註：`pool.query<UserRow>(...)`，不要使用裸的 `any`。

### 快取（Redis）
- Redis 操作統一封裝在 `src/lib/cache.ts`，其他地方不得直接呼叫 Redis client。
- 快取 key 命名格式：`<模組>:<識別碼>`（例如 `url:abc123`）。
- 設定快取時**必須指定 TTL**，不允許永久快取。
- 採用 **Cache-Aside** 模式：先查 Redis → Cache Miss 時才查詢資料庫 → 查詢結果寫回 Redis。若查詢結果為空（資料不存在），不寫入 Redis，避免快取無效資料。
- 執行更新或刪除操作時，必須遵循**先更新／刪除資料庫，再刪除／更新 Redis 快取**的原則，以確保資料最終一致性。

### 錯誤處理
- **並非每一層都需要 `try/catch`**，各層的錯誤處理職責如下：
  - **Repository 層**：不需要 catch，讓原始錯誤自然往上拋。
  - **Service 層**：catch 錯誤後，將操作資訊補充至 error message（如 `[urlService.createShortUrl] 原始錯誤訊息`），再往上拋，方便 debug 時追蹤錯誤來源。
  - **Controller 層**：不處理錯誤，讓錯誤自然往上交由 error middleware 處理。
  - **error middleware**：統一接收所有錯誤並 log，回傳標準化的錯誤 response。
- 不允許 silent catch（`catch (e) {}`），catch 到錯誤後必須往上拋，不得直接吞掉。
- **錯誤的 log 責任統一由 error middleware 處理**，各層不重複 log，避免同一錯誤被記錄多次。

### 日誌（Logging）
- **禁止在正式邏輯中使用 `console.log`**，一律改用專案統一的 logger（`src/lib/logger.ts`）。
- logger 應區分層級：`logger.info`、`logger.warn`、`logger.error`。
- 錯誤發生時必須記錄完整的 error 物件，不得只 log 錯誤訊息字串。
- **嚴禁在 logger 中記錄使用者的敏感資訊**（如密碼、完整 API Key、token 等），錯誤物件在 log 前應確認不含敏感欄位。

### 環境變數
- 敏感資訊（API key、DB 密碼、Redis URL 等）一律透過環境變數注入，不得 hardcode。
- `.env` 不得提交到版本控制，異動只更新 `.env.example`。

---

## 測試規範

### 基本規範（Vitest）
- 測試檔案放在 `tests/` 目錄，對應 `src/` 的結構。
- 測試檔案命名：`kebab-case.test.ts`（如 `url-service.test.ts`）。
- 每個測試案例描述需清楚說明測試情境，使用 `describe` 分組、`it` 描述單一案例。
- 測試應涵蓋正常情境（happy path）與異常情境（error path）。
- **單元測試與 service 層測試**：不得連接真實資料庫或 Redis，一律使用 mock 取代。
- **整合測試（API 路由）**：允許連接測試專用的獨立資料庫（如 testcontainers 或獨立的 test DB），不得使用正式環境資料庫。

### 測試涵蓋要求
- 採用 **TDD（測試驅動開發）** 方式，先寫測試再實作功能。
- 所有新功能都必須有對應的測試。
- API 路由必須有**整合測試**。
- 工具函式（`src/utils/`）必須有**單元測試**。
- 基礎設施封裝（`src/lib/`）必須有**單元測試**。
- 最低測試覆蓋率：**70%**，低於此標準不得提交。

### 測試原則
- 每個測試只驗證**一件事**，不要在單一測試中驗證多個行為。
- 測試名稱必須清楚描述情境（如「當短碼已存在時，應該拋出錯誤」）。
- 測試必須能**獨立執行**，不依賴其他測試的執行順序或結果。

### 範例

```ts
describe('url-service', () => {
  describe('createShortUrl', () => {
    it('應該成功建立短網址', async () => {
      // arrange
      const mockUrl = 'https://example.com';
      vi.mocked(urlRepository.create).mockResolvedValue({ id: 1, shortCode: 'abc123' });

      // act
      const result = await urlService.createShortUrl(mockUrl);

      // assert
      expect(result.shortCode).toBe('abc123');
    });

    it('當短碼已存在時，應該拋出錯誤', async () => {
      // arrange
      vi.mocked(urlRepository.findByCode).mockResolvedValue({ id: 1 });

      // act & assert
      await expect(urlService.createShortUrl('https://example.com', 'abc123'))
        .rejects.toThrow('短碼已存在');
    });
  });
});
```

---

## 安全規範

### 絕對禁止
- 在程式碼中寫死 API key、密碼、token。
- 使用 `eval()` 執行動態程式碼。
- 直接串接 SQL 查詢（SQL Injection 風險）。
- 未驗證的使用者輸入直接使用。
- 儲存含有非 `http://` 或 `https://` scheme 的 URL（如 `javascript:`、`data:`、`vbscript:` 等，Open Redirect / XSS 風險）。

### 必須遵守
- 所有敏感資訊從環境變數讀取（`.env`）。
- 使用參數化查詢（`$1, $2, ...`）。
- 所有使用者輸入都要驗證（遵循開發規範中的 Zod 驗證規則）。
- `originalUrl` 的 scheme 必須限定為 `http://` 或 `https://`（在 Zod schema 中強制驗證）。
- API 路由必須有權限驗證中介軟體。
- 所有 API 路由必須套用 **rate limit middleware**（使用 `express-rate-limit`），防止濫用與暴力攻擊。
- 使用 **helmet** 管理 HTTP 安全 headers，統一在 `src/app.ts` 中初始化。
- CORS 設定統一在 `src/app.ts` 中管理，不得在個別路由自行設定。

---

## 測試與 CI 指令

在提交程式碼或完成任務前，請確認以下指令皆可正常通過：

```bash
# TypeScript 型別檢查
npm run typecheck

# 執行 Lint 檢查
npm run lint

# 執行所有測試
npm test

# 執行測試並顯示覆蓋率報告
npm run coverage
```

> 如果 typecheck、lint 或 test 任一失敗，請修正後再提交，不可跳過。

> 開發伺服器（`npm run dev`）僅供本機功能確認使用，不屬於提交前的驗證步驟。

> 編譯（`npm run build`）可在需要確認產出時執行，不屬於每次提交前的必要步驟。

---

## Agent 行為規範

### ✅ 允許的行為
- 閱讀、修改 `src/` 與 `tests/` 目錄下的檔案。
- 新增符合專案結構的檔案與目錄。
- 執行 `npm run typecheck`、`npm test`、`npm run lint`、`npm run dev`、`npm run build`、`npm run coverage`。
- 更新 `.env.example`（不含實際機密值）。
- 修改 `.gitignore` 以忽略新增的暫存或產出檔案，但不得移除現有的忽略規則（特別是 `.env`）。

### ❌ 禁止的行為
- **不得修改** `.env` 檔案或任何含有實際機密的設定檔。
- **不得刪除** `tests/` 目錄或任何測試檔案。
- **不得執行** 資料庫的破壞性操作（如 `DROP TABLE`、清空資料等）。
- **不得直接操作** Redis，繞過 `src/lib/cache.ts` 封裝層。
- **不得提交** 含有 `console.log` 的 debug 程式碼到正式邏輯中，應改用 `src/lib/logger.ts`。
- **不得安裝**未經確認的第三方套件，請先提出並等待確認。
- **不得推送（git push）** 到任何遠端分支，除非明確被要求。
- **不得直接執行 SQL 修改資料庫結構**，應提供完整的 SQL 異動腳本（如 `ALTER TABLE`、`CREATE INDEX` 等）給開發者審核後手動執行。腳本應考慮向下相容性，新增欄位時須允許 NULL 或提供預設值，避免破壞現有資料。

### ⚠️ 操作前需確認
- 修改 `src/app.ts` 等核心入口檔案前，請先說明變更理由。
- 重構涉及多個模組時，請先列出影響範圍再動手。
- 新增或異動 Zod schema 時，確認相關型別推導是否需要一併更新。

---

## Git Commit 規範

遵循 Conventional Commits，commit message 格式如下：

| 前綴 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | 修復 bug |
| `refactor:` | 重構（不影響功能） |
| `test:` | 測試相關 |
| `docs:` | 文件更新 |

### 範例

```
feat: 新增短網址建立 API
fix: 修復短網址查詢回傳 404 問題
refactor: 重構 url-service 查詢邏輯
test: 新增 url-controller 單元測試
docs: 更新 AGENTS.md 分層架構說明
```

> 不使用 scope（如 `feat(auth):`），保持簡潔格式。

---

## Pull Request 規範

PR 說明應包含以下三個部分：

1. **短摘要**：這個 PR 做了什麼
2. **影響範圍**：受影響的 endpoint 或檔案路徑
3. **設定步驟**：是否有需要額外執行的設定（如 DB 異動、Redis 設定、環境變數新增等）

### 範例

```markdown
## 摘要
新增短網址建立 API，支援自訂短碼與過期時間設定。

## 影響範圍
- `POST /api/url/create`
- `src/controllers/url-controller.ts`
- `src/services/url-service.ts`
- `src/repositories/url-repository.ts`

## 設定步驟
- 無需額外設定
```

### GitHub 相關設定
- `main` 分支已啟用 Branch Protection，**不得直接推送**，一律透過 PR 合併。
- 每個功能或修復請開獨立分支（如 `feat/short-url-create`、`fix/redirect-404`），完成後發 PR。

---

## 效能要求

- 新增查詢時，確認相關欄位是否已有索引，若無請提出建議。
- API 回應時間 **P95 不得超過 500ms**。快取命中的請求預期應在 50ms 以內，冷查詢（直接打 DB）預期應在 200ms 以內，若超出請檢查是否缺少索引或有 N+1 查詢問題。

---

## 遇到不確定的情況

如果不確定該怎麼做，請：

1. 先暫停，不要猜測
2. 詢問使用者
3. 參考專案中已有的類似實作

---

## Docker 與 Nginx

> ⚠️ 此區塊尚未啟用，僅供未來參考，Agent 目前不需要操作相關設定。

### Docker
- 容器化設定檔為根目錄的 `docker-compose.yml`。
- 不得自行修改 `docker-compose.yml`，有需要請告知開發者。
- 不得在容器內直接安裝套件或修改容器設定。

### Nginx
- 作為反向代理，負責將外部請求轉發至 Express 服務。
- Nginx 設定檔位置待補充。
- 不得自行修改 Nginx 設定，有需要請告知開發者。

---

## 其他注意事項

- 如果任務需求不明確，請**主動提問**，不要自行假設後直接修改。
- 每次完成任務後，簡短說明做了哪些變更及原因。
- 若發現現有程式碼有潛在問題，可以標記出來，但不要在未被要求的情況下自行修改。
