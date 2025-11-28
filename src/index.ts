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

console.log('About to listen on', port);
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
})
