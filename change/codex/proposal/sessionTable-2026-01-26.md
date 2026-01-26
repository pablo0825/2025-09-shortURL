# Session / Refresh Token 設計整理

## 1) Session id vs Refresh token id
- 一般情況下**不是同一個概念**
- Session 偏向「登入會話」
- Refresh token 偏向「長期憑證」
- 建議**拆開概念，但允許一一對應**

## 2) 為什麼不建議合併為同一概念
- **生命週期不同**（session 可短、token 通常較長）
- **撤銷粒度不同**（可能要撤銷單一 token，或整個 session）
- **稽核語意不同**（登入行為 vs 憑證管理）

## 3) 建議做法（實務可行）
- **短期**：把 refresh_token row id 當 session id（快速修正）
- **中期**：新增 session table，正式拆開概念（可擴展）

## 4) 建議新增的 session table（PostgreSQL）
```sql
CREATE TABLE session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ NULL,
    user_agent TEXT NULL,
    ip_address INET NULL,
    device_info TEXT NULL,
    reason TEXT NULL,
    CHECK (expires_at >= created_at)
);

CREATE INDEX idx_session_user_id ON session(user_id);
CREATE INDEX idx_session_expires_at ON session(expires_at);
```

## 5) refresh_token table 最小修改建議
**必做**：加 session_id 欄位與 index

```sql
ALTER TABLE refresh_token
    ADD COLUMN session_id BIGINT REFERENCES session(id) ON DELETE CASCADE;

CREATE INDEX idx_refresh_token_session_id ON refresh_token(session_id);
```

**可選**：若要一個 session 只對應一個 refresh token

```sql
ALTER TABLE refresh_token
    ADD CONSTRAINT uq_refresh_token_session UNIQUE (session_id);
```

## 6) 2FA 綁定的重點
- 2FA setup / enable 建議綁定 session
- 目的不是「辨認裝置」，而是**確保同一會話完成流程**## 7) 受 session id / refresh token id 調整影響的程式區塊（src/controller）

### auth.controllers.ts
- `src/controller/auth.controllers.ts:239-287`
  - 產生 refresh token、寫入 `refresh_token` table、設定 cookie
- `src/controller/auth.controllers.ts:453-525`
  - login2fa 插入 `refresh_token` 並取得 `refreshTokenId`，寫入 `user_backup_codes.used_by_session_id`
- `src/controller/auth.controllers.ts:569-654`
  - 讀取 refreshToken cookie、查 `refresh_token` table、比對 hash、撤銷 token
- `src/controller/auth.controllers.ts:716-725`
  - refresh token rotation，新增 `refresh_token`
- `src/controller/auth.controllers.ts:770-840`
  - refresh token 驗證與撤銷（另一段）
- `src/controller/auth.controllers.ts:880-893`
  - 取得/註銷所有 refresh tokens
- `src/controller/auth.controllers.ts:947`
  - 依 token id 註銷單一 refresh token
- `src/controller/auth.controllers.ts:1180`
  - 依 user 註銷所有 refresh tokens

### user.controllers.ts
- `src/controller/user.controllers.ts:324`
  - 依 user 註銷所有 refresh tokens
- `src/controller/user.controllers.ts:641-652`
  - 註解提到 `used_by_session_id = refresh_token_id`，以及用 ip 找 refresh_token id
