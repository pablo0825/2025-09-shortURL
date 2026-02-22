// express.d.ts
import { Request } from 'express';

// 擴展 Express 的 Request 介面
// 宣告全域變數
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                role: string;
            };
            //
            avatarFileType?: FileTypeResult;
        }
    }
}

// 這行很重要，讓 TypeScript 將此檔案視為模組
export {};