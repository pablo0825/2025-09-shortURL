## TL;DR（最重要 5 點）
1. `logoutAll` 目前只撤銷 `refresh_token`，沒有同步撤銷 `session`，和你已導入的 session 概念不一致。
2. 既然目標是「全部裝置登出」，建議同時把 `session.revoked_at` 一併更新，並可寫 `reason = 'logout_all'`。
3. `SELECT refresh_token_hash` 只為了回傳數量，建議改用 `UPDATE ... RETURNING` 或 `SELECT COUNT(*)`，避免把敏感資料拉到應用層。
4. `tokens.rowCount` 目前計算的是「未撤銷 refresh_token 數量」，不是 session 數量，若你要顯示一致語意，建議調整訊息或查詢來源。
5. 若你需要強一致性（token 與 session 同步撤銷），請把兩個更新放在同一個 transaction 內。

## High risk issues（安全或資料風險，需說明影響與建議方向）
- `logoutAll` 僅撤銷 `refresh_token`，`session` 仍保持有效狀態，導致稽核與會話狀態不一致，後續若以 `session` 作為稽核或風控依據可能誤判。建議在同一個 transaction 內新增 `UPDATE session SET revoked_at = now(), reason = 'logout_all' WHERE user_id = $1 AND revoked_at IS NULL`。

## Bugs / Logic issues（可能的 bug 或邏輯問題）
- `tokens.rowCount` 是 `SELECT refresh_token_hash ...` 的筆數，若未來 refresh token 與 session 是 1:1 或 1:N，訊息可能與實際「登出裝置數」不一致。建議改成用 `UPDATE ... RETURNING id` 計算實際撤銷筆數，或明確標示為 refresh token 數量。

## Design / Architecture（架構與模組切分建議）
- 既然已引入 `session` 概念，建議 `logoutAll` 維持「會話語意」與「憑證語意」同步，避免後續其它功能以 `session` 判斷時出現不一致。
- 可考慮抽成共用 helper，例如 `revokeSessionsByUserId(userId, reason)`，減少散落在多個 controller 的重複邏輯。

## Consistency / Style（命名、錯誤處理、logging、typing）
- 若你在其他地方使用 `reason = 'logout'`，這裡建議統一規則（例如 `logout_all` 或 `logout`），避免分析時需要特別處理。
- `refresh_token_hash` 不需要回傳到應用層，能不取就不取，減少敏感資料流動。

## Actionable checklist（可直接執行的待辦事項，使用 `- [ ]`）
- [ ] 在 `src\controller\auth.controllers.ts` 的 `logoutAll` 新增 `session` 撤銷：`revoked_at = now(), reason = 'logout_all'`
- [ ] 把 `session` 撤銷放在與 `refresh_token` 相同的 transaction 內
- [ ] 用 `SELECT COUNT(*)` 或 `UPDATE ... RETURNING` 取代 `SELECT refresh_token_hash`
- [ ] 確認 `reason` 的字串規則（例如 `login` / `logout` / `logout_all`）在全專案一致

---
## 附錄：logoutAll 回應後清理範本

以下為採用「回應後清理」的結構重點（先回應，再做 blacklist；blacklist 失敗不影響回應）：

```ts
// 1) 完成 DB 撤銷並 COMMIT
// 2) clear cookie
// 3) 先回應 200
// 4) 再做 blacklist，失敗只記 log

res.clearCookie("refreshToken");

const response = {
    ok: true,
    message: `登出 ${refreshTokenCount.rowCount} 個 refresh token`,
};

res.status(200).json(response);

try {
    await handleAccessTokenBlackList(req);
} catch (err) {
    console.error("[api:auth/logoutAll] blacklist failed:", err);
}
return;
```
