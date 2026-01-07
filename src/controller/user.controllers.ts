import {Request, Response} from "express";
import type {PoolClient} from "pg";
import {pool} from "../pool";
import {safeJoin, ensureDir} from "../utils/fs.utils"
import path from "path";
import {v4 as uuid4} from "uuid";
import sharp from "sharp";
import fs from "fs/promises";
import {writeUserLogToDB} from "../utils/writeUserLogToDB";
import {UserLogActionEnum} from "../enum/userLogAction.enum";
import {bodySchema, userIdSchema} from "../zod/user.schema";
import {emailSchema} from "../zod/auth.schema";
import bcrypt from "bcrypt";
import {handleAccessTokenBlackList} from "../utils/handleAccessTokenBlackList";
import {sendEmail} from "../email/sendEmail";
import {generateTotpSecret, buildOtpAuthUrl, verifyTotpCode} from "../utils/totp"
import {toDataUrl} from "../utils/qrcode";
import {encrypt, decrypt} from "../utils/cyptoUtils"
import redis from "../redis/redisClient";
import crypto from "crypto";


// [api] 讀取個人資料
export const getMyProfile = async (req: Request, res: Response) => {
    // role拿到user_id, role_email，沒有role或permission，在中介層就會被擋掉
    // 檢查user_id是否存在，true，往下執行; false，回傳401(未登入/token失效)
    // 用 user_id, role_email當作key，到 users table查user date，限制是user_id = id, email = role_email is_active = true
    // 檢查user date是否存在，ture，往下執行; false，回傳404(沒有資源)
    // response date: email, nickname, role, is_active, avatar_url, 2fa_enabled,last_login_at, last_password_reset_at
    // rateLimit: 15分鐘，100次
}

// [api] 更新個人資料
export const updateMyProfile = async (req: Request, res: Response) => {
    // 允許更新欄位: nickname, job_title, unit
    // nickname不需要唯一
    // role拿到user_id, role_email，沒有 role 或 permission，在中介層就會被擋掉
    // 用zod驗證，從request body拿出nickname, job_title, unit
    // 檢查zod驗證是否success，true，往下執行; false，回傳400 (格式錯誤)
    // 用 user_id, roel_email 作為key，更新 users table的nickname, job_title, unit等欄位，限制是user_id = id, email = role_email is_active = true
    // 檢查user date是否存在，ture，往下執行; false，回傳404(沒有資源)
    // 寫入user_log table，選update_profile
    // response date: email, nickname, role, is_active, avatar_url, 2fa_enabled,last_login_at, last_password_reset_at
    // rateLimit: 1小時，3次
}

export const updateMyAvatar = async (req: Request, res: Response) => {
    let userIdNum:number;
    let userIdStr:string;
    let client: PoolClient | undefined;
    let oldAvatarKey: string | null = null;

    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg = userIdParams.error.issues[0]?.message ?? "未登入"
        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    userIdNum = userIdParams.data;
    userIdStr = userIdNum.toString();

    // 檢查檔案是否存在
    if (!req.file) {
        return res.status(400).json({
            ok: false,
            error: "請上傳 avatar 檔案"
        })
    }

    // 可選256/512
    const AVATAR_SIZE:number = 512;

    // 存放根目錄
    // process.cwd() 獲取當前工作目錄的路徑
    // path.join 合併路徑，如:/2025-shortURL/uploads/avatars/
    const uploadRoot:string = path.join(process.cwd(), "uploads", "avatars");

    // 檢查路徑合法的話，回傳/2025-shortURL/uploads/avatars/user-99
    const userDir = safeJoin(uploadRoot, userIdStr);

    // 檢查目標路徑是否存在，不存在的話，就建立資料夾
    await ensureDir(userDir);

    // 用uuid4創造一個隨機的web檔名稱
    const filename = `${uuid4()}.webp`;

    // 檢查路徑是否合法，合法的話，回傳/2025-shortURL/uploads/avatars/user-99/550e8400-e29b.web
    const absFilePath = safeJoin(userDir, filename);

    // 對外搭配用的url
    const avatarUrl:string = `/static/avatars/${userIdStr}/${filename}`;

    try {
        // 因為是memoryStorage(記憶體儲存)模式，所以從buffer讀取檔案
        // 以下程式碼是專門用來處理使用者頭像的程式碼，sharp還可以有更多參數計進行調整
        const webBuffer = await sharp(req.file.buffer, {
            // 限制像素輸入
            limitInputPixels: 20_000_000,
        })
                // 自動旋轉，手機拍出的照片有可能是倒一邊，所以需要進行旋轉
                .rotate()
                // 將圖片調整到指定的長寬比
                // fit:cover 確保圖片填滿正方形區塊，裁切成正方形
                .resize(AVATAR_SIZE, AVATAR_SIZE, {fit: "cover"})
                // 將圖片格式轉成web，壓縮品質設定成85%
                .webp({quality: 85})
                // 輸出成2進位buffer，並存到memory中
                .toBuffer();

        // 把memory中的buffer，寫入到指定的資料夾中
        await fs.writeFile(absFilePath, webBuffer);

        // 從資料庫獲得一條單獨的連線
        client = await pool.connect();
        // [交易] 開始
        await client.query('BEGIN');

        // 用FOR UPDATE 鎖定使用者，避免併發修改
        const user = await client.query<{avatar_key: string}>('SELECT avatar_key FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE', [userIdNum]);

        if (user.rowCount === 0) {
            // [交易] 失敗，結束
            await client.query("ROLLBACK");

            // 如果user不存在，把剛剛暫存的buffer刪除
            await fs.unlink(absFilePath).catch((err) => {});

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        oldAvatarKey = user.rows[0].avatar_key;

        // 把avatar的路徑，更新到users table的avatar_key欄位中
        // 加入頭像的更新時間
        const updateResult = await client.query('UPDATE users SET avatar_key = $1, avatar_updated_at = now() WHERE id = $2', [avatarUrl, userIdNum]);

        if (updateResult.rowCount === 0) {
            // [交易] 失敗，結束
            await client.query("ROLLBACK");

            // 如果user不存在，把剛剛暫存的buffer刪除
            await fs.unlink(absFilePath).catch((err) => {});

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        // 把更新紀錄寫入userLog中
        await writeUserLogToDB(userIdNum, UserLogActionEnum.UPDATE_AVATAR, {
            detail:"使用者請求更新使用者頭像",
            metadata: {
                name: req.user?.name,
                filename: filename,
                url: avatarUrl,
                type: req.avatarFileType
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? null
        }, client)

        // [交易] 成功，結束
        await client.query('COMMIT');

        // 刪除舊的頭像
        // startsWith 判斷字串的開頭是否相同
        if (oldAvatarKey  && oldAvatarKey.startsWith(`/static/avatars/${userIdStr}/`)) {
            // .replac 把oldAvatarURL的偽裝的 static 替換成 真實的 uploads
            const oldRelPath:string = oldAvatarKey.replace("/static", "uploads");

            // process.cwd() 獲取當前目錄的路徑
            // path.join() 合併成相對路徑
            // 回傳，如:/2025-shortURL/uploads/avatars/user-99/550e8400-e29b.web
            const oldAbsPath:string = path.join(process.cwd(), oldRelPath);

            // 定義基礎目錄，如:/2025-shortURL/uploads/avatars/
            // 定義邊界
            const allowedBase:string = path.join(process.cwd(), "uploads", "avatars", `${userIdStr}/`);

            // 雙重檢查: 確保要刪除的檔案，真的在/avatars/底下
            // resolve() 可以檢查試圖跳出的路徑的真身
            const resolvedOld:string = path.resolve(oldAbsPath);

            // path.sep 加上/
            // 基礎目錄的路徑，轉為絕對路徑，怕遺失/，所以用.sep加上/
            const resolvedBase:string = path.resolve(allowedBase) + path.sep;

            if (resolvedOld.startsWith(resolvedBase)) {
                // 刪除舊的使用者頭像
                await fs.unlink(resolvedOld).catch((err) => {
                    // .warn() 異常但不影響
                    console.warn("刪除舊檔失敗:", err);
                });
            }
        }

        return res.status(200).json({
            ok: true,
            message: "使用者頭像更新成功",
            data: {
                filename: filename,
                url: avatarUrl,
            }
        })
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                // [交易] 失敗，結束
                await client.query('ROLLBACK');
            } catch {}
        }

        // 刪除暫存的buffer
        await fs.unlink(absFilePath).catch(err => {});

        const msg = err instanceof Error ? err.message : String(err);

        // error() 嚴重警告，會導致程式無法運行
        console.error("[api:user/updateAvatar] error:", msg, err);

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    } finally {
        // [交易] 結束釋放路線
        if (client) client.release();
    }
}

// [api] 更新使用者密碼
export const changeMyPassword = async (req: Request, res: Response) => {
    let client: PoolClient | undefined;

    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const bodyParams = bodySchema.safeParse(req.body);

    if (!bodyParams.success) {
        const msg:string = bodyParams.error.issues[0]?.message ?? "密碼格式錯誤";

        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;
    const {currentPassword, newPassword} = bodyParams.data;

    try {
        const user = await pool.query<{email:string, password_hash:string, nickname:string}>('SELECT email, password_hash, nickname FROM users WHERE id = $1 AND is_active = TRUE', [userId]);

        if (user.rowCount === 0) {
            // [交易] 失敗，結束
            await pool.query("ROLLBACK");

            return res.status(404).json({
                ok: false,
                error:"使用者不存在或資料異常"
            })
        }

        const passwordHash:string = user.rows[0].password_hash;
        const nickname:string = user.rows[0].nickname;
        const email:string = user.rows[0].email;

        // 比較密碼是否相同
        const isSamePassword:boolean = await bcrypt.compare(currentPassword, passwordHash);

        if (!isSamePassword) {
            // [交易] 失敗，結束
            await pool.query('ROLLBACK');

            return res.status(400).json({
                ok: false,
                error: "舊密碼輸入錯誤，請重新確認",
            });
        }

        // 新密碼加密
        const newPasswordHash:string = await bcrypt.hash(newPassword, 10);

        // 獲得一條單獨的路線
        client = await pool.connect();

        // [交易] 開始
        await client.query('BEGIN');

        // 更新密碼
        const updateUser = await client.query('UPDATE users SET password_hash = $1, last_password_reset_at = now() WHERE id = $2 AND is_active = TRUE', [newPasswordHash, userId]);

        if (updateUser.rowCount === 0) {
            await client.query('ROLLBACK');

            return res.status(404).json({
                ok: false,
                error: "使用者不存在或資料異常",
            });
        }

        // 註銷所有裝置
        await client.query('UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL ', [userId]);

        // 更新user_log
        await writeUserLogToDB(userId, UserLogActionEnum.UPDATE_PASSWORD, {
            detail:"使用者更新密碼成功",
            metadata: {
                name: nickname,
            },
            ipAddress: req.ip,
            userAgent: req.get("user-agent") ?? null
        }, client);

        // [交易] 成功，結束
        await client.query('COMMIT');

        // 額外:處理access token的黑名單
        // 這邊不等待完成，讓它去後台背景處理
        handleAccessTokenBlackList(req).catch(err =>
                console.error("[api:user/changeMyPassword] failed to blacklist token:", err)
        );

        const resetAt = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

        // [標註] 我覺得這邊可以優化
        // HTML 郵件內容（使用反引號）
        const html = `
            <h2>更新密碼</h2>
            <p>親愛的 ${nickname}：</p>
            <p>您的帳號密碼已於 ${resetAt} 成功重設。</p>
            <p>重設位置 IP: ${req.ip}</p>
            <p>如果這不是您本人的操作,請立即聯繫我們的客服團隊。</p>
        `;

        const emailOptions = {
            to: email,
            subject:` ${nickname} 您的密碼更新成功通知`,
            html: html,
            text:`親愛的 ${nickname}：\n\n您的帳號密碼更新成功。\n\n如果這不是您本人的操作,請立即聯繫我們的客服團隊。\n\n`,
        }

        // 寄出email
        // 不等結果，讓它在後台執行
        sendEmail(emailOptions).catch(err => {
            console.error("[api:user/changeMyPassword] notification failed to send:", err)
        });

        return res.status(200).json({
            ok: true,
            message: "密碼已成功重設，請使用新密碼重新登入",
        });
    } catch (err) {
        if (client) {
            // 多包一層try catch是為了讓finally可以被執行
            // 如果沒有包的話，會停留在catch上
            // 這樣就不能釋放pool的連線資源
            try {
                await client.query('ROLLBACK');
            } catch {}
        }

        const msg = err instanceof Error ? err.message : String(err);

        console.error("[api:user/changeMyPassword] error:", msg, err);

        return res.status(500).json({
            ok: false,
            error: "系統錯誤"
        });
    } finally {
        if (client) client.release();
    }
}

export const setup2fa = async (req:Request, res:Response) => {
    const userIdParams = userIdSchema.safeParse(req.user?.id);

    if (!userIdParams.success) {
        const msg:string = userIdParams.error.issues[0]?.message ?? "未登入";

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userId:number = userIdParams.data;

    const userEmailParams =emailSchema.safeParse(req.user?.email);

    if (!userEmailParams.success) {
        const msg:string = userEmailParams.error.issues[0]?.message ?? "未登入";

        return res.status(401).json({
            ok: false,
            error: msg,
        });
    }

    const userEmail:string = userEmailParams.data;

    //
    const secret:string = generateTotpSecret();
    const issuer:string = "MyApp";
    const accountName:string = userEmail;

    //
    const otpauthUrl:string = buildOtpAuthUrl(issuer, accountName, secret);
    //
    let qrDataUrl:string;

    try {
        // 產生qr code圖片
        qrDataUrl = await toDataUrl(otpauthUrl);
    } catch (err) {
        console.error("[api:user/setup2fa] QR code generation failed", err);

        return res.status(500).json({
            ok: false,
            error: "無法產生驗證 QR Code",
        });
    }

    // 產生長度為32的隨機碼，16 bytes等於兩個字元
    const nonce:string = crypto.randomBytes(16).toString("hex");

    // 加密secret，並回傳encrypted, iv, authTag
    const {encrypted, iv, authTag} = encrypt(secret);

    const redisKey = `2fa:pending:${userId}:${nonce}`;
    // 過期時間設定10分鐘(600秒)
    const ttlSec = 600;

    // 把加密資料存到redis中
    // 把buffer轉成整數陣列，會變太胖，浪費redis的記憶體
    // 所以在存入前，先改成base64格式的字串
    try {
        await redis.set(redisKey, JSON.stringify({
            encrypted:encrypted.toString("base64"),
            iv:iv.toString("base64"),
            authTag:authTag.toString("base64"),
        }), {EX:ttlSec});
    } catch (err) {
        console.error("[api:user/setup2fa] Redis write failed", err);

        return res.status(503).json({
            ok: false,
            error: "系統暫時無法設定 2FA，請稍後再試",
        });
    }

    return res.json({
        ok:true,
        qrCode:qrDataUrl,
        expiresInSec: 600,
        randomCode:nonce
    });
};

// 啟用2fa
export const enable2fa = async (req:Request, res:Response) => {
    // userIdParams用zod驗證，true，往下執行; false，返回401錯誤
    // userId = userIdParams.data;
    // codeAndNonceParams用zod驗證，true，往下執行; false，返回400錯誤 (zod用string，用正規表達式/^\d{6}$/，表示6碼數字) (字元長度達32)
    // {code, nonce} = codeParams.data
    // redisKey = `2fa:pending:${userId}:${nonce}`
    // 用try catch包住redis，怕查詢時爆掉
    // raw:string | null = await redis.get(redisKey);
    // raw判斷是否存在，true，往下執行; false，返回400，error:"2FA 設定已過期，請重新開始"
    // --- (不知道需不需要)
    // 寫一個interface，{encrypted:string; iv:string; authTag:string}
    // let payload:TwoFaRedisPayload
    // 用try catch包住，用json.parse(raw)，解開資料
    // 從payload中把變數解出，如:encrypted, iv, authTag
    // --
    // parsedData = json.parse(raw)，解開資料
    // 用Buffer.from(parsedData, base64)，把字串轉回buffer，獲得encrypted, iv, authTag
    // 用decrypt把encrypted解開
    // secret = decrypt(encrypted, iv, authTag)
    // ok = verifyTotpCode(token:code, secret)
    // 檢查ok是否存在，true，往下執行; false，返回400，error:"驗證碼錯誤"
    // 產生backup code
    // backupCodes:arr[] = generateBackupCodes(10); 產生10組
    // 用try catch包住
    // 把backupCode，hash一下
    // backupHashes = await hashBackupCodes(backupCodes);
    // 用userId作為key，更新user table的欄位，twofa_enabled = true, twofa_secret_encrypted = encrypted, twofa_secret_iv = iv, twofa_secret_auth_tag = authTag, twofa_enabled_at = now();
    // 用insert，把userId, backupHashes插入到user_backup_codes，然後要用for迴圈把backupHashes中的每一筆hash取出來，存到db中
    // version要怎麼處理?
}
