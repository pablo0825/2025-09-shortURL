# Project Remediation Roadmap

Date: 2026-03-11

## Goal

這份 roadmap 的目的不是新增功能，而是先把現有專案整理到：

- 架構邊界更清楚
- 認證與快取邏輯更一致
- 測試更可信
- 維運更可觀測

的狀態。

## Guiding Principles

- 先修治理問題，再擴功能
- 先處理高風險、高影響、低爭議項目
- 優先改善會影響安全性、資料一致性、上線可信度的區域
- 文件要反映真實狀態，不要描述理想狀態

## P0

### 1. 收斂 transaction 邊界

目標：

- 停止 service 直接操作 `pool`
- 讓 transaction 邏輯回到 repository 或專用 transaction coordinator

原因：

- 這是架構規則失效的核心來源之一
- 若不先處理，之後所有新功能都可能複製相同壞模式

### 2. 釐清背景任務的啟動方式

目標：

- 確認 `src/task/tasks.ts` 是否真正被載入
- 若沒有，建立清楚的 task registration 或獨立 worker 啟動流程

原因：

- 背景任務不執行屬於 silent failure
- 這種問題最容易在 production 中長期存在而不被注意

### 3. 統一 Redis / token / blacklist 抽象

目標：

- 收斂 `lib/cache` 與 `redis-provider`
- 統一 key naming、TTL、token blacklist 行為

原因：

- 認證與快取的安全邏輯不能散落多套 API
- 這是後續審計與測試的前提

### 4. 移除不符合規範的永久快取寫入入口

目標：

- 移除或封鎖 `cacheSetNoTtl()`

原因：

- 規則若已明定 TTL 必填，就不應保留反例 API
- 保留這種入口會讓規範失去約束力

## P1

### 1. 補強 auth 測試與 request contract 測試

目標：

- 修正 route/integration tests 中與真實 request schema 不一致的案例
- 補 branch-heavy 區域的測試

優先區域：

- auth
- RBAC
- 2FA
- error handling
- token/session/logout path

原因：

- 現階段最大問題不是測試少，而是部分測試不值得信任

### 2. 明確化 dependency 分級與 health strategy

目標：

- 區分 hard dependency 與 soft dependency
- 重新定義 bootstrap 成功條件
- 明確區分 liveness 與 readiness

原因：

- 啟動成功不應只代表 process 活著
- 應反映系統是否具備提供核心功能的能力

### 3. 將 email 設定完整環境變數化

目標：

- SMTP host、port、secure、from name 全數環境變數化

原因：

- 避免供應商綁定
- 改善部署彈性
- 讓 staging / production / local 測試更一致

### 4. 升級 logger 與錯誤可觀測性

目標：

- 採用結構化 log
- 加入 request id / correlation id
- 建立一致的 error code
- 補敏感資訊遮罩

原因：

- 認證、權限、背景任務問題都需要良好的 observability 才能維運

## P2

### 1. 修正文件，使其重新可信

目標：

- AGENTS.md 與真實模組策略一致
- docs 描述現況，而非理想狀態

原因：

- 文件若不可信，會反過來放大協作風險

### 2. 重新定義工程規則的落地方式

目標：

- 明確哪些規則是必須遵守
- 明確哪些規則是目標方向
- 對少數合理例外建立白名單

原因：

- 規則若全部寫得很硬，但實際做不到，最終只會失去治理能力

### 3. 重新盤點模組責任

目標：

- 明確 `lib/`、`utils/`、`services/`、`repositories/` 的責任邊界
- 避免同一種能力出現在兩套位置

原因：

- 抽象重複會讓未來新功能無法自然延續既有風格

## Suggested Execution Order

建議不要平行處理太多事情，否則容易同時動到多條主線。

建議順序：

1. 先修 transaction boundary
2. 再確認背景任務啟動方式
3. 再收斂 Redis / token abstraction
4. 接著修正 auth 與 route contract 測試
5. 然後補 health/readiness、email config、logging
6. 最後整理文件與工程規則

## Success Criteria

完成第一輪整改後，至少應達成：

- service 不再直接控制 DB transaction
- cron / worker 的啟動邏輯清楚可驗證
- token blacklist 與 auth cache 走單一抽象
- route/integration tests 能反映真實 request contract
- logging 可以支援 request trace 與錯誤定位
- 文件內容與專案實作一致

## Closing Note

這份 roadmap 的重點不是把專案「重寫」，而是先讓它恢復工程上的可控性。

當一個後端已經具備：

- 認證
- 權限
- 2FA
- 審計
- 背景任務
- 快取

這種複雜度時，治理就不能再是可選項，而是系統可靠性的前提。
