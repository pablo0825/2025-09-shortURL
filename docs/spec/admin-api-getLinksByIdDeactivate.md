# PATCH /admin/links/:id/deactivate

## Purpose
作為一位管理員，我希望用 linkId 來停用 link，這樣我才可以快速禁止異常的 link 被訪問。

## Input / Output
### Input
- Path parameter: id (必填)

### Output
```json
{
    "ok": true,
    "data": {
        "id": 101,
        "before": { "isActive": true, "status": "active" },
        "after": { "isActive": false, "status": "disabled" },
        "updatedAt": "2026-03-06T09:30:00.000Z"
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
- IF request params 缺少 id,系統應回傳 400，並說明 error message: "參數格式有誤"
### 4. 業務驗證
- IF linkId 對應的 link 不存在，系統應回傳 404，並說明 error message: "查無資料"
- IF linkId 對應的 link 已被刪除，系統應回傳 409，並說明 error message: "連結已刪除，無法停用"
- IF linkId 對應的 link 狀態已為 "disabled"，系統應回傳 409，並說明 error message: "連結已停用"

## Test Cases
- 正常停用，回傳 200 + before/after 資料
- 未登入，回傳 401
- role 為 "user"，回傳 403
- linkId 不存在，回傳 404
- link 已被刪除，回傳 409
- link 已被停用，回傳 409

## Notes
- 資料驗證全部交由 zod 處理
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)