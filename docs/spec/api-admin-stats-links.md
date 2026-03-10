# GET /admin/stats/links

## Purpose
作為一位管理員，我希望查看 link 的整體狀態分布與過去 7 天的點擊趨勢，這樣我才可以快速掌握 link 的使用狀況與流量來源。

## Input / Output
### Input
無 query params。

### Output
```json
{
  "ok": true,
  "data": {
    "summary": {
      "totalLinks": 320,
      "byStatus": {
        "active": 210,
        "expired": 60,
        "disabled": 30,
        "deleted": 20
      },
      "newLinksToday": 8
    },
    "dailyClicks": [
      { "date": "2026-03-04", "clicks": 1200 },
      { "date": "2026-03-05", "clicks": 980 }
    ],
    "topReferers": [
      { "domain": "google.com", "clicks": 430 },
      { "domain": "twitter.com", "clicks": 210 }
    ],
    "byDeviceType": [
      { "deviceType": "desktop", "clicks": 800 },
      { "deviceType": "mobile", "clicks": 600 },
      { "deviceType": "tablet", "clicks": 120 },
      { "deviceType": "bot", "clicks": 40 },
      { "deviceType": "unknown", "clicks": 20 }
    ],
    "byCountry": [
      { "countryCode": "TW", "clicks": 900 },
      { "countryCode": "US", "clicks": 300 }
    ]
  }
}
```

### 欄位說明

**summary**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `totalLinks` | number | 所有 link 總數（含所有狀態） |
| `byStatus.active` | number | 狀態為 active 的 link 數 |
| `byStatus.expired` | number | 狀態為 expired 的 link 數 |
| `byStatus.disabled` | number | 狀態為 disabled 的 link 數 |
| `byStatus.deleted` | number | 狀態為 deleted 的 link 數 |
| `newLinksToday` | number | 今日（UTC 00:00 起）新增的 link 數 |

**dailyClicks（陣列，固定 7 筆，依日期 asc 排列）**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `date` | string (YYYY-MM-DD) | 日期，以 UTC 時間計算 |
| `clicks` | number | 當天的點擊總數（來自 `link_click_events.clicked_at`） |

**topReferers（陣列，最多 10 筆，依點擊數 desc 排列）**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `domain` | string | Referer domain（從 `link_click_events.referer` 萃取） |
| `clicks` | number | 過去 7 天來自該 domain 的點擊數 |

**byDeviceType（陣列，依點擊數 desc 排列）**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `deviceType` | string | 裝置類型，可能值：`desktop` / `mobile` / `tablet` / `bot` / `unknown` |
| `clicks` | number | 過去 7 天該裝置類型的點擊數 |

**byCountry（陣列，最多 10 筆，依點擊數 desc 排列）**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `countryCode` | string | 2 碼國家代號（ISO 3166-1 alpha-2） |
| `clicks` | number | 過去 7 天來自該國家的點擊數 |

## Rules (用 EARS 寫)
### 1. 身分驗證
- IF request user 缺少 id，系統應回傳 401，並說明 error message: "未登入"
### 2. 權限驗證
- IF request user 缺少 role，系統應回傳 403，並說明 error message: "權限不足"
- IF user role 不屬於 "admin" | "assistant"，系統應回傳 403，並說明 error message: "權限不足"
### 3. 資料規則
- WHEN 某天沒有任何點擊，該天 `clicks` 應回傳 0，不可省略該筆
- WHEN 過去 7 天無任何點擊資料，`topReferers`、`byDeviceType`、`byCountry` 應回傳空陣列
- `topReferers` 僅統計 `referer` 不為 null 的點擊，直接輸入（無 referer）不列入
- `byCountry` 僅統計 `country_code` 不為 null 的點擊
- 「過去 7 天」定義為：今天 00:00:00 UTC 往前推 6 天，至今天 23:59:59 UTC（含今天，共 7 天）

## Test Cases
- 正常請求，回傳 200 + 完整資料
- 某天無任何點擊，該天 clicks 為 0
- 過去 7 天無點擊，topReferers / byDeviceType / byCountry 回傳空陣列
- referer 全為 null，topReferers 回傳空陣列
- country_code 全為 null，byCountry 回傳空陣列
- 未登入，回傳 401
- role 為 "user"，回傳 403

## Notes
- 資料驗證全部交由 zod 處理
- 所有日期計算以 UTC 為準
- 點擊相關指標（dailyClicks、topReferers、byDeviceType、byCountry）均以 `link_click_events` 為資料來源
- link 狀態計算規則：
  - `deleted`：`deleted_at IS NOT NULL`
  - `disabled`：`deleted_at IS NULL AND is_active = FALSE AND expire_at > now()`
  - `expired`：`deleted_at IS NULL AND expire_at <= now()`
  - `active`：`deleted_at IS NULL AND is_active = TRUE AND expire_at > now()`
- 成功/失敗皆需要寫入 audit log，log 需包含: actorUserId, actorRole, action, targetType, targetId(非必填), targetDisplay(非必填), requestPath, requestMethod, requestIp, userAgent, status, errorMessage(非必填), diff(非必填)
