# GET /admin/stats/users

## Purpose
作為一位管理員，我希望查看過去 7 天的使用者活躍趨勢，這樣我才可以快速掌握使用者的成長與活躍狀況。

## Input / Output
### Input
無 query params。

### Output
```json
{
  "ok": true,
  "data": {
    "daily": [
      {
        "date": "2026-03-04",
        "dau": 38,
        "newUsers": 3,
        "linkCreators": 12
      },
      {
        "date": "2026-03-05",
        "dau": 41,
        "newUsers": 2,
        "linkCreators": 15
      }
    ],
    "summary": {
      "wau": 180,
      "twoFaRate": 0.62,
      "deactivatedThisWeek": 2
    }
  }
}
```

### 欄位說明
**daily（陣列，固定 7 筆，依日期 asc 排列）**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `date` | string (YYYY-MM-DD) | 日期，以伺服器 UTC 時間計算 |
| `dau` | number | 當天有 session 活動的不重複使用者數（依 `session.last_seen_at`） |
| `newUsers` | number | 當天新註冊的使用者數（依 `users.created_at`） |
| `linkCreators` | number | 當天有建立 link 的不重複使用者數（依 `links.created_at` + `creator_user_id`） |

**summary**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `wau` | number | 過去 7 天內有 session 活動的不重複使用者數 |
| `twoFaRate` | number (0~1) | 目前 active 使用者中，2FA 啟用比例，四捨五入至小數點後 2 位 |
| `deactivatedThisWeek` | number | 過去 7 天內被停用或刪除的使用者數（依 `admin_audit_logs`） |

## Rules (用 EARS 寫)
### 1. 身分驗證
- IF request user 缺少 id，系統應回傳 401，並說明 error message: "未登入"
### 2. 權限驗證
- IF request user 缺少 role，系統應回傳 403，並說明 error message: "權限不足"
- IF user role 不屬於 "admin" | "assistant"，系統應回傳 403，並說明 error message: "權限不足"
### 3. 資料規則
- WHEN 某天沒有任何 session 活動，該天 `dau` 應回傳 0，不可省略該筆
- WHEN 某天沒有新使用者，該天 `newUsers` 應回傳 0，不可省略該筆
- WHEN 某天沒有任何 link 被建立，該天 `linkCreators` 應回傳 0，不可省略該筆
- WHEN active 使用者總數為 0，`twoFaRate` 應回傳 0
- 「過去 7 天」定義為：今天 00:00:00 UTC 往前推 6 天，至今天 23:59:59 UTC（含今天，共 7 天）

## Test Cases
- 正常請求，回傳 200 + 7 筆 daily 資料 + summary
- 某天無任何活躍使用者，該天 dau 為 0
- 某天無新使用者，該天 newUsers 為 0
- 某天無 link 建立，該天 linkCreators 為 0
- 無任何 active 使用者，twoFaRate 為 0
- 未登入，回傳 401
- role 為 "user"，回傳 403

## Notes
- 資料驗證全部交由 zod 處理
- 所有日期計算以 UTC 為準
- `twoFaRate` 計算母數為 `is_active = TRUE` 的使用者，不含已刪除帳號
- `deactivatedThisWeek` 來源為 `admin_audit_logs`，篩選 `target_type = 'user'`、`action IN ('soft_delete_user')` （待補上停用使用者 API 後，需將對應 action 字串加入此清單）、`created_at` 在過去 7 天內
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)
