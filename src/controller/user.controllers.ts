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
    const userIdNum = Number(req.user?.id);
    const userIdStr = String(userIdNum); //
    let client: PoolClient | undefined;
    let oldAvatarKey: string | null = null;

    if (Number.isNaN(userIdNum)) {
        return res.status(401).json({
            ok: false,
            error: "未登入"
        })
    }

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
    // path.join 合併路徑，如:/2025-shortURL/uploads/
    const uploadRoot:string = path.join(process.cwd(), "uploads");
    // 檢查路徑合法的話，回傳/2025-shortURL/uploads/avatars/user-99
    const userDir:string = safeJoin(uploadRoot, "avatars", userIdStr);

    // 檢查目標路徑是否存在，不存在的話，就建立資料夾
    await ensureDir(userDir);

    // 用uuid4創造一個隨機的web檔名稱
    const filename = `${uuid4()}.webp`;
    // 檢查路徑是否合法，合法的話，回傳/2025-shortURL/uploads/avatars/user-99/550e8400-e29b.web
    const absFilePath:string = safeJoin(userDir, filename);

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
        const user = await client.query<{avatar_key: string}>('SELECT avatar_key FROM users WHERE id = $1 FOR UPDATE', [userIdNum]);

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

        // // 5. 刪除舊檔 (同步執行，會增加回應時間，但保證硬碟乾淨)
        // // 只有在 COMMIT 成功後才執行
        // if (oldAvatarKey && oldAvatarKey.startsWith(`/static/avatars/${userIdStr}/`)) {
        //     const oldRelPath = oldAvatarKey.replace("/static", "uploads");
        //     const oldAbsPath = path.join(process.cwd(), oldRelPath);
        //
        //     // 雙重檢查：確保要刪除的檔案真的位於 avatars 目錄下
        //     const resolvedOld = path.resolve(oldAbsPath);
        //     const resolvedBase = path.resolve(allowedBase) + path.sep;
        //
        //     if (resolvedOld.startsWith(resolvedBase)) {
        //         // 不等待它完成 (Fire and Forget) 也可以，看您是否在乎捕捉刪除錯誤
        //         // 這裡選擇 await 確保乾淨
        //         await fs.unlink(resolvedOld).catch(err => console.warn("刪除舊檔失敗:", err));
        //     }
        // }

        // [標記] 未完成
        // 刪除舊的頭像
        if (oldAvatarKey  && oldAvatarKey.startsWith(`/static/avatars/${userIdStr}/`)) {
            // process.cwd() 獲取當前目錄的路徑
            // path.join 合併路徑
            // .replac 把oldAvatarURL的偽裝的 static 替換成 真實的 uploads
            // 回傳，如:/2025-shortURL/uploads/avatars/user-99/550e8400-e29b.web
            const oldAbs:string = path.join(process.cwd(), oldAvatarKey?.replace("/static", "uploads"));

            ///2025-shortURL/uploads/avatars/
            const allowedBase:string = path.join(process.cwd(), "uploads", "avatars") + path.sep;

            // 轉為絕對路徑
            // .resolve 可以檢查試圖跳出的路徑的真身
            const resolvedOld:string = path.resolve(oldAbs);

            // 檢查路徑開頭是否相同，ture，到資料夾中刪除指定檔案，false，跳過
            if (resolvedOld?.startsWith(path.resolve(allowedBase))) {
                // 刪除舊的使用者頭像
                await fs.unlink(resolvedOld).catch((err) => {});
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