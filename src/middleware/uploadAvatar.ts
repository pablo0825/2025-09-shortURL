// uploadAvatar.ts
import multer from "multer";
import type { Request } from "express";

// 2bm
const MAX_BYTES = 2 * 1024 * 1024;

export const uploadAvatar = multer({
    // 小檔案暫存到memory就好，大檔案在暫存到disk
    // 檔案不會有重名的問題，因為memory會每個檔案，創造一個buffer物件，並掛到req.file下
    storage: multer.memoryStorage(),
    // 限制檔案大小
    limits:{fileSize:MAX_BYTES},
    // 過濾檔案類型
    // req 請求物件
    // file 上傳檔案
    // cb 回呼函式，用來告訴multer，是否要接受檔案
    fileFilter(req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("只允許上傳圖片"));
        }
        // 接受檔案
        // 第一個參數是錯誤，null表示沒有錯誤
        cb(null, true);
    },
}).single("avatar");