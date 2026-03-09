# PATCH /admin/links/deactivate

## Purpose
作為一位管理員，我希望用 linkId 來批次停用 link，這樣我才可以快速禁止異常的 link 被訪問。

## Input / Output
### Input
- Request body: ids（必填，陣列，至少一個元素）

### Output
```json
{
  "ok": true,
  "data": {
    "succeeded": [
      {
        "id": 101,
        "before": { "isActive": true, "status": "active" },
        "after": { "isActive": false, "status": "disabled" },
        "updatedAt": "2026-03-06T09:30:00.000Z"
      }
    ],
    "failed": [
      {
        "id": 102,
        "reason": "連結已刪除，無法停用"
      }
    ]
  }
}
```

## Rules (用 EARS 寫)
### 1. 身分驗證
- IF request user 缺少 id，系統應回傳 401，並說明 error message: "未登入"
### 2. 權限驗證
- IF request user 缺少 role，系統應回傳 403，並說明 error message: "權限不足"
- IF user role 不屬於 "admin" | "assistant"，系統應回傳 403，並說明 error message: "權限不足"
### 3. 參數驗證
- IF request body 缺少 ids,系統應回傳 400，並說明 error message: "參數格式有誤"
- IF ids 為空陣列，系統應回傳 400，並說明 error message: "參數格式有誤"
- IF ids 長度超過 50，系統應回傳 400，並說明 error message: "參數格式有誤"
### 4. 業務驗證
- WHEN ids 中部分 id 對應的 link 不存在，系統應將該筆加入 failed，reason: "查無資料"
- WHEN ids 中部分 id 對應的 link 狀態為 "deleted"，系統應將該筆加入 failed，reason: "連結已刪除，請使用 restore"
- WHEN ids 中部分 id 對應的 link 狀態為 "disabled"，系統應將該筆加入 failed，reason: "連結已停用，請使用 reactivate"
- WHEN ids 中部分 id 對應的 link 狀態為 "expired"，系統應將該筆加入 failed，reason: "連結已過期，無法停用"
- WHEN 操作完成後存在至少一筆 succeeded 及一筆 failed，系統應回傳 207
- WHEN 所有 id 皆成功，系統應回傳 200
- WHEN 所有 id 皆失敗，系統應回傳 422，並說明 error message: "所有連結皆無法停用"

## Test Cases
- 全部成功，回傳 200
- 部分成功部分失敗，回傳 207
- 全部失敗，回傳 422
- 未登入，回傳 401
- role 為 "user"，回傳 403
- ids 為空陣列，回傳 400
- ids 長度超過 50，回傳 400
- linkId 不存在，回傳該筆在 failed
- link 狀態為 "deleted"，回傳該筆在 failed
- link 狀態為 "disabled"，回傳該筆在 failed
- link 狀態為 "expired"，回傳該筆在 failed

## Notes
- 資料驗證全部交由 zod 處理
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)