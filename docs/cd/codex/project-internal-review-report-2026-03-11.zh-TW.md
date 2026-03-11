# Project Internal Review Report

Date: 2026-03-11

## Executive Summary

這個專案已經不是單純的短網址 API，而是一個具備中型後端系統特徵的服務，涵蓋：

- 短網址建立、查詢、轉址
- JWT、refresh token、session 管理
- RBAC 權限控管
- 2FA
- 使用者資料管理
- 管理端統計與審計
- 背景任務與快取同步

從功能完整度來看，專案已具備相當基礎；但從嚴格的資深後端工程角度評估，專案目前最大的問題不是功能不足，而是工程治理落後於系統複雜度。

核心判斷如下：

- 功能成長速度快於治理能力
- 架構規則與實作開始分叉
- 測試存在，但部分測試不足以保證真實行為
- 安全邏輯與快取抽象尚未完全收斂
- 維運與可觀測性仍偏開發期做法

如果繼續在目前狀態下直接疊加功能，未來風險會集中在：

- 安全邏輯不一致
- 架構邊界進一步崩壞
- 問題更難排查
- 協作成本上升

## Current State

### 系統現況

目前專案已有以下正向特徵：

- 啟動流程會初始化 DB、Redis、rate limiter、RBAC、SMTP。
- 路由切分清楚，已區分 `auth`、`link`、`user`、`admin`。
- 資料表設計完整，含 session、refresh token、2FA、user log、audit log、click event、background task。
- 短網址主流程已有 cache-aside、negative cache、動態 TTL 與 cache invalidation。
- 已有一定數量的測試與 coverage artifact。

### 現況判斷

專案目前處於一個明確轉折點：

- 已具備中型後端的複雜度
- 但仍保留不少小型專案式的工程治理方式

也就是說，這個專案現在最需要的不是新功能，而是結構與治理的整理。

## Key Findings

### 1. 架構邊界已開始鬆動

雖然文件明確要求：

`Route -> Controller -> Service -> Repository -> Database`

但實作中已有 service 直接使用 `pool` 與 transaction，也有 task 直接執行 SQL。

這代表 repository 已經不是唯一資料存取邊界，風險包括：

- transaction 管理分散
- query 邏輯越來越難統一
- 錯誤處理無法一致
- 重構成本提高

### 2. 背景任務啟動方式不夠明確

cron job 已定義，但目前沒有看到它在主啟動流程中被清楚載入。

這類問題的危險之處在於：

- 編譯不會報錯
- 功能看起來存在
- 實際上可能根本沒執行

### 3. Redis 與 token 相關抽象不夠統一

目前 Redis 能力至少分散在：

- `src/lib/cache.ts`
- `src/utils/redis-provider.ts`

這會讓：

- TTL 規則分散
- key naming 分散
- token blacklist 與快取行為難以集中審查

### 4. 測試存在，但部分測試與真實 contract 脫鉤

至少已有案例顯示 route test 傳入的 request body 與 controller 實際驗證欄位不一致。

這代表部分測試只能證明「mock 有被呼叫」，不能證明 API 對外 contract 正常。

### 5. 文件與實作不一致

例如 AGENTS.md 要求 ESM，但專案實際標準已是 CommonJS，且另有文件明確鎖定 CommonJS。

這會讓文件失去作為真實規範來源的價值，反而變成協作風險。

### 6. 可觀測性不足

目前 logger 只是 `console.*` 的薄封裝，缺少：

- 結構化 log
- request id / correlation id
- error code
- 敏感資訊遮罩

當系統已經有 auth、RBAC、2FA、session、background task 時，這種可觀測性水準是不夠的。

## Risk Assessment

### 架構風險

- 分層規則被繞過，技術債會持續複製
- DB transaction 邏輯散落多處，降低可維護性
- 背景任務生命週期不清楚，容易產生 silent failure

### 安全風險

- token blacklist、refresh token、一般 cache 沒有完全走同一套抽象
- 永久快取寫入能力仍存在，與規範衝突
- SMTP readiness 與真實可用性脫鉤
- 安全事件排查能力不足

### 品質風險

- route/integration test 不完全代表真實 request contract
- branch coverage 與 function coverage 偏弱
- 測試綠燈不一定代表真實行為安全

### 維運風險

- logger 不具 production-ready 能力
- 基礎設施設定部分硬編碼
- 啟動流程沒有清楚區分 hard dependency 與 soft dependency

## Recommended Priorities

### P0

- 收斂 transaction 邊界，停止 service 直接控制 DB transaction
- 釐清 cron / task 是否真的被啟動
- 統一 Redis / token / blacklist abstraction
- 移除或封鎖不帶 TTL 的 cache 寫入入口

### P1

- 修正 route/integration tests，讓 request contract 回到可信狀態
- 補強 auth、RBAC、2FA、error path 的 branch-heavy 測試
- 明確化 health/readiness 與 dependency 分級
- 將 SMTP 等基礎設施設定完整環境變數化
- 升級 logging 與錯誤可觀測性

### P2

- 修正 AGENTS/docs，讓文件重新可信
- 重新整理模組責任與工程規則
- 將背景任務、API server、必要 worker 的角色界線拉清楚

## Suggested Next Step

若要進入下一階段討論，建議不要同時發散多條線，而是依照以下順序逐步審查：

1. transaction boundary
2. background task lifecycle
3. auth / Redis abstraction
4. testing strategy
5. observability / health strategy
6. documentation cleanup

## Conclusion

這個專案有不錯的基礎，也已經走到比一般 side project 更複雜的階段。但正因為它已經有：

- 認證
- 權限
- 2FA
- session
- 審計
- 快取
- 背景任務

治理能力就不能再停留在功能堆疊式開發。

嚴格來說，這個專案現在最重要的任務不是擴功能，而是先把現有系統整理到可控、可驗證、可維護的狀態。
