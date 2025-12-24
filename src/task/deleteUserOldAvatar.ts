// deleteUserOldAvatar.ts
import {pool} from "../pool";
import fs from "fs/promises"
import path from "path";

export async function deleteUserOldAvatarTask () {
    // 用try catch包起來
    // 查所有userId, avatar_key，條件是is_action = ture, avatar_key不能為null
    // 檢查回傳值 === 0，ture，跳出程式; false，往下執行
    // 用user.row.map來跑迴圈
    // userDir = `./uploads/avatars/${u.id}/`
    // oldFiles = await fs.readdir(userDir)，查出資料夾中，所有的檔案名稱
    // avatarUrl = u.avatar_key.replace("/static", "uploads")
    // filename = path.basename(avatarUrl); 把檔案名稱取出來
    // otherFile = oldFiles.filter(fn => filename !== filename); 把檔案名稱不符合的，都取出來變成一個陣列
    // 跑for迴圈，i=0, end設定陣列大小, i++
    // 用path.join把檔案完整路徑拼出來，然後用fs.unlink(檔案路徑)把檔案刪除
    //

    // 改用絕對路徑，避免找不到的問題
    const uploadsAvatarsRoot:string = path.join(process.cwd(), "uploads", "avatars");

    // 開始時間
    const startTime = Date.now();

    // 掃描使用者數量
    // 刪除文件數量
    // 跳過使用者數量
    let scannedUsers:number = 0;
    let removedFiles:number = 0;
    let skippedUsers:number = 0;

    let files: string[];

    try {
        const user = await pool.query(`SELECT id, avatar_key FROM users WHERE is_active = TRUE AND avatar_key IS NOT NULL AND avatar_updated_at >= now() - interval '7 days'`);

        if (user.rowCount === 0) {
            console.log("[CRON-04] 沒有使用者頭像，無需清理");
            return;
        }

        console.log(`[CRON-04] 開始清理 ${user.rowCount} 位使用者的舊頭像`);

        // .map無法等await回應，所以要用for迴圈處理
        for(const u of user.rows) {
            // 掃描使用者數量+1
            scannedUsers++;

            const avatarKey = u.avatar_key;

            // 檢查開頭是否不相同，true，執行程式; false，往下執行
            if (!avatarKey.startsWith("/static/avatars/")) {
                // 跳過使用者+1
                skippedUsers++;

                // 繼續執行
                continue;
            }

            const userDir:string = path.join(uploadsAvatarsRoot, String(u.id));

            // 現在的key
            const filename:string = path.basename(avatarKey);

            try {
                // 獲取資料夾中所有檔案名稱
                // 裝到string []
                files = await fs.readdir(userDir);
            } catch (err) {
                // 跳過使用者+1
                skippedUsers++;

                continue;
            }

            // 把檔案名稱不符的，都取出來變成一個陣列
            const otherFile:string[] = files.filter(fn => fn !== filename);

            for (const file of otherFile) {
                // 拚出檔案完整路徑
                const abs:string = path.join(userDir, file);

                try {
                    // 刪除檔案
                    await fs.unlink(abs);

                    // 刪除檔案+1
                    removedFiles++;
                } catch {
                    // ...
                }
            }

        }
        console.log(`[CRON-04] 清理完成：掃描使用者 ${scannedUsers}，跳過 ${skippedUsers}，刪除舊頭像檔 ${removedFiles} 個`);
    } catch (err) {
        console.error("[CRON-04] 使用者頭像清理失敗", err);
    }
}