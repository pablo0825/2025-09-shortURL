// index.ts
// import dotenv from 'dotenv';
// dotenv.config({ path: '../.env' });
// 引入插件
import express from 'express';
// import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
// 引入變數
import { pool } from "./pool";
import router from "./route/link.route";
import authRoute from "./route/auth.route";
import { redirectToLongUrl } from "./controller/link.controllers";
import { cacheShortUrl } from "./middleware/cacheShortUrl";
import {loadRbacFromDb} from "./rbac/loadRbacFromDb"
// import "./task/tasks"

const app = express();

app.use(express.json());
app.use(cookieParser());

const port = Number(process.env.PORT ?? 3001);
// console.log(process.env.PORT);

app.use("/api/link", router);
app.use("/api/auth", authRoute);
//
app.get("/health", async (_req:Request, res:Response) => {
    try {
        // 確認有連到資料庫
        await pool.query('SELECT 1');
        console.log("資料庫連接成功")
        res.status(200).json({
            ok: true,
            db:'連接成功',
            uptime:process.uptime()
        });
    } catch (err) {
        console.error('DB connect error:', err);
        res.status(500).json({
            ok: false,
            error: "資料庫沒有連接到"
        })
    }
});

// 加入快取作為中介層
app.get("/:code", cacheShortUrl, redirectToLongUrl);

app.use((_req:Request, res:Response) => res.status(404).send("Not Found"));

async function bootstrap() {
    try {
        console.log('=== 伺服器啟動中 ===');

        // 1. 測試資料庫連線
        console.log('[1/3] 檢查資料庫連線...');
        await pool.query('SELECT NOW()');
        console.log('✅ 資料庫連線成功');

        // 3. 載入 RBAC 權限
        console.log('[3/3] 載入 RBAC 權限...');
        await loadRbacFromDb();

        // 4. 啟動伺服器
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (err) {
        
    }
}





