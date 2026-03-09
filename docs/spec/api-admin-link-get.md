# GET /admin/links/:id 

## Purpose
`作為一位管理員，我希望用 linkId 來取得 link 的資訊，這樣我才可以快速查看 link 的資訊。
`
## Input / Output
### Input
- Path parameter: id (必填)

### Output
```json
{
    "ok": true,
    "data": {
      "id": 101,
      "code": "abc123",
      "shortUrl": "https://sho.rt/abc123",
      "longUrl": "https://example.com/page?a=1",
      "targetDomain": "example.com",

      "status": "active",
      "createdAt": "2026-03-03T10:00:00.000Z",
      "updatedAt": "2026-03-04T09:00:00.000Z",
      "expireAt": "2026-03-10T10:00:00.000Z",
      "deletedAt": null,

      "clickCount": 42,
      "lastClickedAt": "2026-03-05T06:00:00.000Z",

      "creator": {
          "userId": 7,
          "email": "user@example.com"
      },

      "meta": {
          "isExpired": false,  
          "isDeleted": false,
          "canDisable": true,
          "canRestore": false
      }
  }
}
```

## Rules (用 EARS 寫)
- IF request user 缺少 id，系統應回傳 401，並說明 error message: "未登入"
- IF request user 缺少 role，系統應回傳 403，並說明 error message: "權限不足"
- IF user role 不屬於 "admin" | "assistant"，系統應回傳 403，並說明 error message: "權限不足"
- IF request params 缺少 id,系統應回傳 400，並說明 error message: "參數格式有誤"
- IF linkId 對應的 link 不存在，系統應回傳 404，並說明 error message: "查無資料"
- WHEN linkId 對應的 link 已被刪除，系統應回傳 200，並包含完整的 link 資訊

## Test Cases
- 正常搜尋，回傳 200 + link 資料
- 未登入，回傳 401
- role 為 "user"，回傳 403
- linkId 不存在，回傳 404
- linkId 存在但已被刪除，回傳 200

## Notes
- 資料驗證全部交由 zod 處理
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)