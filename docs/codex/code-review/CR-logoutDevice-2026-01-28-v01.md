## TL;DR（最重要 5 點）
1. `logoutDevice()` 沒有使用 transaction，`session` 與 `refresh_token` 可能出現部分成功的狀態，建議比照 `logoutAll()` 一致性處理。`src/controller/auth.controllers.ts` `logoutDevice()`
2. 若登出的是「當前裝置」，沒有清除 cookie 或黑名單 access token，可能讓使用者短期內仍可用現有 access token。`src/controller/auth.controllers.ts` `logoutDevice()`
3. `sessionId` 的型別與 `logoutTokenIdSchema` 的輸出型別需確認是否為 number；若是 string，會導致 query 條件失效或隱性轉型問題。`src/controller/auth.controllers.ts` `logoutDevice()`
4. `refresh_token` 更新在 `rowCount` 檢查前執行，行為雖然安全但不直觀，建議改為「確認 session 存在且可撤銷後再更新」。`src/controller/auth.controllers.ts` `logoutDevice()`
5. `logoutDevice()` 不會清除 `refreshToken` cookie，若使用者是登出當前裝置，UX 與安全性可能不一致。`src/controller/auth.controllers.ts` `logoutDevice()`

## High risk issues（安全或資料風險，需說明影響與建議方向）
- 未針對「當前裝置」做 access token blacklisting 或 cookie 清除：如果使用者登出自己目前的 session，現有 access token 仍可能在到期前有效。建議比照 `logoutAll()` 加上 `handleAccessTokenBlackList(req)` 與必要的 cookie 清除。`src/controller/auth.controllers.ts` `logoutDevice()`
- 缺少 transaction：`session` 與 `refresh_token` 目前是兩個獨立 query，失敗時容易造成只撤銷其中一個的狀態。建議用單一 transaction 保證一致性。`src/controller/auth.controllers.ts` `logoutDevice()`

## Bugs / Logic issues（可能的 bug 或邏輯問題）
- `logoutTokenIdSchema` 的輸出型別若是 string，`const sessionId:number = sessionIdParam.data;` 會造成型別不一致或隱性轉型。建議確認 schema 是否 `z.coerce.number()` 或明確 `Number()`。`src/controller/auth.controllers.ts` `logoutDevice()`
- `refresh_token` 更新在 `rowCount` 檢查前執行，若 `session` 不存在或已撤銷，仍會執行 update（雖然條件上通常不會動到資料）。建議先確認 session 狀態再處理，讓流程更直觀。`src/controller/auth.controllers.ts` `logoutDevice()`

## Design / Architecture（架構與模組切分建議）
- `logoutAll()` 已使用 transaction 與 access token blacklisting，但 `logoutDevice()` 邏輯分散且缺少一致性處理；可抽出共用的 revoke helper（session + refresh_token + optional blacklist）以降低重複與差異。`src/controller/auth.controllers.ts`

## Consistency / Style（命名、錯誤處理、logging、typing）
- `logoutAll()` 使用 transaction 與 `client`，`logoutDevice()` 直接 `pool.query`，風格不一致；建議統一錯誤處理與資源管理方式。`src/controller/auth.controllers.ts`
- 若為「登出當前裝置」，`logoutAll()` 會 `res.clearCookie("refreshToken")`；`logoutDevice()` 無對應處理，行為不一致。`src/controller/auth.controllers.ts`

## Actionable checklist（可直接執行的待辦事項，使用 `- [ ]`）
- [ ] 讓 `logoutDevice()` 使用 transaction，確保 `session` 與 `refresh_token` 同步撤銷。`src/controller/auth.controllers.ts`
- [ ] 若目標是當前裝置，補上 `handleAccessTokenBlackList(req)` 與必要的 cookie 清除。`src/controller/auth.controllers.ts`
- [ ] 確認 `logoutTokenIdSchema` 輸出型別為 number，或顯式轉型。`src/controller/auth.controllers.ts`
- [ ] 將 `refresh_token` 更新移到確認 `session` 存在且可撤銷之後，提升可讀性與一致性。`src/controller/auth.controllers.ts`
