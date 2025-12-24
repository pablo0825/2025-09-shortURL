// validateAvatarFile.ts
import type { Request, Response, NextFunction } from "express";
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp"]);

export async function validateAvatarFile(
        req: Request,
        res: Response,
        next: NextFunction
) {
    // 檢查使用者是否有上傳檔案
    if (!req.file?.buffer) {
        return res.status(400).json({
            ok: false,
            error: "請上傳 avatar 檔案",
        });
    }

    try {
        // 二進制特徵檢查
        // png開頭一定是 89 50 4E 47等位元組
        // 可以檢查惡意檔案
        const fileType = await fileTypeFromBuffer(req.file.buffer);

        if (!fileType || !ALLOWED_EXT.has(fileType.ext)) {
            return res.status(400).json({
                ok: false,
                error: "圖片格式不正確，只允許 JPG / PNG / WEBP",
            });
        }

        // 這裡可以選擇把「可信格式」存起來，後面 sharp 可用
        req.avatarFileType = fileType;

        next();
    } catch (err) {
        console.error("[validateAvatarFile] 檔案驗證失敗:", err);

        res.status(400).json({
            ok: false,
            error: "檔案驗證失敗，請確認檔案未損壞",
        });
    }
}
