# Controller–Service（可選 DAO）分層整理

## 核心概念
- **Controller**：處理 HTTP 入口、驗證 request、呼叫 service、回傳 response。
- **Service**：承載業務流程與交易，集中管理 DB 交易、鎖、以及副作用（例如 email、log、token revoke）。
- **DAO（可選）**：只負責資料存取與查詢，避免重複 SQL；不處理業務判斷。

## 為什麼先做 Controller–Service、再視情況加 DAO
- 小到中型專案可先用 Controller–Service，減少過度設計。
- 當 query 重複或變複雜時，再抽 DAO 可以降低重複、提升一致性。

## 針對 `changeMyPassword()` 的具體落點建議
- **Controller**
  - `safeParse` 驗證
  - 呼叫 `changeMyPasswordService(...)`
  - 統一回應 200/400/500
- **Service**
  - `BEGIN` → `SELECT ... FOR UPDATE` → `UPDATE` → `COMMIT`
  - 交易後處理副作用：revoked token/session、寄信、寫 user_log
- **DAO（若拆）**
  - `findUserForUpdate(userId)`
  - `updatePassword(userId, oldHash, newHash)`
  - `revokeTokens(userId)`

## 實務好處（針對目前場景）
- DB 交易與鎖集中，避免 `pool.query` / `client.query` 混用。
- `changeMyPassword()` 更短、更易讀、維護成本下降。
- 後續要加「密碼強度」「MFA」「審計紀錄」時更容易擴充。

## 範例（Controller–Service–DAO）

以下是極簡示範，重點在分工與結構。

### DAO（只做資料存取）
```ts
// src/dao/user.dao.ts
export const UserDao = {
    async findForUpdate(client: PoolClient, userId: number) {
        return client.query<{
            id: number;
            email: string;
            password_hash: string;
            nickname: string;
        }>(
            "SELECT id, email, password_hash, nickname FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE",
            [userId]
        );
    },

    async updatePassword(
        client: PoolClient,
        userId: number,
        oldHash: string,
        newHash: string
    ) {
        return client.query(
            "UPDATE users SET password_hash = $1, last_password_reset_at = now() WHERE id = $2 AND password_hash = $3 AND is_active = TRUE",
            [newHash, userId, oldHash]
        );
    },

    async revokeTokens(client: PoolClient, userId: number) {
        await client.query(
            "UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
            [userId]
        );
        await client.query(
            "UPDATE session SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
            [userId]
        );
    }
};
```

### Service（流程與規則）
```ts
// src/services/user.service.ts
export const changeMyPasswordService = async (input: {
    userId: number;
    currentPassword: string;
    newPassword: string;
    ip: string;
    userAgent: string | null;
}) => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const user = await UserDao.findForUpdate(client, input.userId);
        if (user.rowCount === 0) {
            throw new Error("USER_NOT_FOUND");
        }

        const { email, password_hash, nickname } = user.rows[0];

        const isSame = await bcrypt.compare(input.currentPassword, password_hash);
        if (!isSame) {
            throw new Error("PASSWORD_MISMATCH");
        }

        const newHash = await bcrypt.hash(input.newPassword, 10);
        const updated = await UserDao.updatePassword(client, input.userId, password_hash, newHash);

        if (updated.rowCount === 0) {
            throw new Error("CONFLICT_UPDATE");
        }

        await UserDao.revokeTokens(client, input.userId);
        await client.query("COMMIT");

        // 副作用（可非同步）
        sendEmail({ to: email, subject: "密碼更新通知", html: `...` }).catch(() => {});
        await writeUserLogToDB(input.userId, UserLogActionEnum.UPDATE_PASSWORD, {
            detail: "使用者更新密碼成功",
            metadata: { name: nickname },
            ipAddress: input.ip,
            userAgent: input.userAgent
        });
    } catch (err) {
        if (client) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        throw err;
    } finally {
        if (client) client.release();
    }
};
```

### Controller（只接 HTTP）
```ts
// src/controller/user.controllers.ts
export const changeMyPassword = async (req: Request, res: Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);
    if (!userIdParams.success) {
        return res.status(401).json({ ok: false, error: "未登入" });
    }

    const bodyParams = bodySchema.safeParse(req.body);
    if (!bodyParams.success) {
        return res.status(400).json({ ok: false, error: "密碼格式錯誤" });
    }

    try {
        await changeMyPasswordService({
            userId: userIdParams.data,
            currentPassword: bodyParams.data.currentPassword,
            newPassword: bodyParams.data.newPassword,
            ip: req.ip,
            userAgent: req.get("user-agent") ?? null
        });

        return res.status(200).json({
            ok: true,
            message: "密碼已成功重設，請使用新密碼重新登入"
        });
    } catch {
        return res.status(500).json({ ok: false, error: "系統錯誤" });
    }
};
```
