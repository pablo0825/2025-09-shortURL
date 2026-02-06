# Admin GET /admin/users 規格（Pagination / Filter / Sort 概念版）

## 目的
- 回傳使用者列表（id, email, nickname, role, is_active, last_login_at, twofa_enabled）。
- 支援後台常見的分頁、篩選與排序。

## Pagination（分頁）
### 方式
- 使用 page/limit（頁碼型）。
- 適合 admin 後台與中小量資料。

### 參數
- page：預設 1
- limit：預設 20，最大 100

## Filter（篩選）
### 常見條件
- role：admin / assistant / user
- is_active：true / false
- twofa_enabled：true / false
- q：關鍵字（email / nickname 模糊搜尋）

### 參數
- role
- is_active
- twofa_enabled
- q

## Sort（排序）
### 可排序欄位
- email
- nickname
- last_login_at
- created_at（若有）

### 參數
- sortBy：預設 last_login_at（或 created_at）
- sortOrder：asc / desc，預設 desc

## 回傳結構（概念）
- data：使用者列表
- pagination：page / limit / total / totalPages

## Query Params 清單（整理）
- page (default=1)
- limit (default=20, max=100)
- q（email/nickname 模糊搜尋）
- role
- is_active
- twofa_enabled
- sortBy (email | nickname | last_login_at | created_at)
- sortOrder (asc | desc)

## 範例 Query
- /admin/users?page=1&limit=20
- /admin/users?page=2&limit=50&role=assistant
- /admin/users?page=1&limit=20&q=alice
- /admin/users?page=1&limit=20&is_active=false&sortBy=last_login_at&sortOrder=desc

## 回傳範例（示意）
```json
{
  "ok": true,
  "data": [
    {
      "id": 101,
      "email": "alice@example.com",
      "nickname": "Alice",
      "role": "assistant",
      "is_active": true,
      "last_login_at": "2026-02-05T10:12:45Z",
      "twofa_enabled": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2080,
    "totalPages": 104
  }
}
```

## 錯誤回傳格式（概念）
```json
{
  "ok": false,
  "error": "FORBIDDEN",
  "message": "permission denied",
  "details": null
}
```

### 常見錯誤狀態
- 400：參數錯誤（例如 page/limit 不合法）
- 401：未登入
- 403：權限不足
- 500：伺服器錯誤

## 欄位定義表（回傳 data 內的使用者欄位）
- id: number，使用者 id
- email: string，使用者 email
- nickname: string，使用者暱稱
- role: enum（admin / assistant / user）
- is_active: boolean，是否啟用
- last_login_at: datetime | null，最後登入時間
- twofa_enabled: boolean，是否啟用 2FA

## 補充：篩選條件與 Zod 驗證說明

### 建議納入的 filter
- role：admin / assistant / user
- twofa_enabled：true / false
- q：關鍵字（email / nickname 模糊搜尋）

### Zod 範例（含 role / twofa_enabled / q）
```ts
import {z} from "zod";

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),

    sortBy: z.enum(["created_at", "last_login_at", "email", "nickname"]).default("created_at"),
    order: z.enum(["asc", "desc"]).default("desc"),

    includeInactive: z.coerce.boolean().default(false),

    role: z.enum(["admin", "assistant", "user"]).optional(),
    twofa_enabled: z.coerce.boolean().optional(),
    q: z.string().trim().min(1).optional()
});

const parsed = querySchema.parse(req.query);
```

### q: z.string().trim().min(1).optional() 解釋
- q 可以不傳（optional）。
- 傳了就會先 trim 前後空白。
- trim 後若長度為 0（空字串），驗證會失敗。
