# GET /admin/links 

## Purpose
作為一位管理員，我希望用 longUrl, email, shortCode 等來搜尋 link，這樣我才可以快速檢查 link 是否為 active, expired, disabled, deleted，以及檢查 link 的 clickCount, lastClickedAt，發現是否有 異常的 link 。

## Input / Output
### Input
``` json
{
    "page": 1, // 必填
    "limit": 20,  // 必填，預設 20，最大 200
    "sortBy": "created_at", // 必填，可選值: "created_at" | "updated_at" | "expire_at" | "click_count" | "last_clicked_at"
    "sortOrder": "desc", // 必填，可選值: 'asc' | 'desc'
    "q": "", // 選填，模糊搜尋 shortCode, longUrl, creatorEmail
    "status":  "active" // 選填，可選值: "active" | "expired" | "disabled" | "deleted"
}
```

### Output
```json
{
    "ok": true,
    "data": [
        {
            "id": 101,
            "code": "abc123",
            "shortUrl": "https://sho.rt/abc123",
            "longUrl": "https://example.com/page",
            "targetDomain": "example.com",
            "status": "active",
            "createdAt": "2026-03-03T10:00:00.000Z",
            "updatedAt": "2026-03-03T10:00:00.000Z",
            "expireAt": "2026-03-10T10:00:00.000Z",
            "deletedAt": null,
            "clickCount": 42,
            "lastClickedAt": "2026-03-03T12:00:00.000Z",
            "creatorUserId": 7,
            "creatorEmail": "user@example.com"
        }
    ],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 120,
        "totalPages": 6
    }
}
```

## Rules (用 EARS 寫)
- IF request user 缺少 id ，系統應回傳 401，並說明 error message: "未登入"
- IF request user 缺少 role，系統應回傳 403，並說明 error message: "權限不足"
- IF user role 不等於 "admin"，系統應回傳 403，並說明 error message: "權限不足"
- IF request query 缺少 page, limit, sortBy, sortOrder 其中任一，系統應回傳 400，並說明 error message: "參數格式有誤"
- IF limit 超過 200，系統應回傳 400，並說明 error message: "參數格式有誤"
- IF sortBy 不屬於 "created_at" | "updated_at" | "expire_at" | "click_count" | "last_clicked_at"， 系統應回傳 400，並說明 error message: "參數格式有誤"
- IF sortOrder 不屬於 "asc" | "desc"， 系統應回傳 400，並說明 error message: "參數格式有誤"
- IF status 不屬於 "active" | "expired" | "disabled" | "deleted"， 系統應回傳 400，並說明 error message: "參數格式有誤"
- WHEN q 有值，系統應對 shortCode, longUrl, creatorEmail 進行模糊搜尋
- WHEN status 未傳，系統應回傳所有狀態的 link

## Notes
- 資料驗證全部交由 zod 處理
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)