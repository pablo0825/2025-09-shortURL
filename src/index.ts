// index.ts
// import dotenv from 'dotenv';
// dotenv.config({ path: '../config.env' });
// 引入插件
import express from 'express';
// import path from 'path';
import type { Request, Response, NextFunction } from 'express';
// 引入變數
import { pool } from "./pool.js";
import router from "./route/link.route";

const app = express();

app.use(express.json());

const port = Number(process.env.PORT ?? 3001);

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

app.use("/api/link", router);

console.log('About to listen on', port);
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
})
