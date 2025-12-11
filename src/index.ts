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
import redis, { initRedis } from "./redis/redisClient";
import {verifyEmailConnection} from "./email/sendEmail";
import { Server } from 'http';

// import "./task/tasks"

const app = express();

app.use(express.json());
app.use(cookieParser());

const port = Number(process.env.PORT ?? 3001);
// console.log(process.env.PORT);

// 存放Server實例，以便稍後關閉
let server:Server;

app.use("/api/link", router);
app.use("/api/auth", authRoute);
//
app.get("/health", async (_req:Request, res:Response) => {
    try {
        // 確認有連到資料庫
        await pool.query('SELECT 1');

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
        // 1. 測試資料庫連線
        console.log('[1/4] 檢查資料庫連線...');
        await pool.query('SELECT NOW()');
        console.log('✅ 資料庫連線成功');

        // 2. 初始化 Redis (使用你原本的函數)
        console.log('[2/4] 初始化 Redis...');
        await initRedis();

        // 3. 載入 RBAC 權限
        console.log('[3/4] 載入 RBAC 權限...');
        await loadRbacFromDb();

        // 4. SMTP是否正常
        console.log("[4/4] 檢查 SMTP 連線...");
        await verifyEmailConnection();

        // 5. 啟動伺服器
        server = app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (err) {
        console.error('❌ 啟動失敗:', err);

        if (err instanceof Error) {
            console.error('錯誤訊息:', err.message);
        }

        // 錯誤退出
        process.exit(1);
    }
}

bootstrap().catch((err) => {
    console.error('未預期的啟動錯誤:', err);

    process.exit(1);
});

// 優雅關閉處理
async function gracefulShutdown(signal: string) {
    console.log(`\n收到 ${signal} 信號，正在關閉伺服器...`);

    // 關閉超時，就直接關閉主程式
    const shutdownTimeout = setTimeout(() => {
        console.error('關閉超時（30秒），強制退出');

        process.exit(1);
    }, 3000);

    try {
        if (server) {
            console.log('⏳ 正在關閉 HTTP Server (停止接收新請求)...');

            // 建立promise，true呼叫resolve, false呼叫reject
            await new Promise<void>((resolve, reject) => {
                // .close(callback) 用於停止伺服器接受新的連線
                server.close((err) => {
                    if (err) {
                        console.error('HTTP Server 關閉錯誤:', err);
                        // 拒絕promise
                        return reject(err);
                    }

                    // 關閉成功
                    console.log('✅ HTTP Server 已關閉');
                    // 兌現 promise
                    resolve();
                })
            })
        }

        if (redis.isOpen) {
            await redis.quit();

            console.log('✅ Redis 已關閉');
        }

        await pool.end();
        console.log('✅ 資料庫連線已關閉');

        console.log('✅ 資源已清理\n');

        // 成功完成所有清理後，清除超時計時器
        clearTimeout(shutdownTimeout);

        process.exit(0);
    } catch (err) {
        console.error('❌ 關閉時發生錯誤:', err);

        // 成功完成所有清理後，清除超時計時器
        clearTimeout(shutdownTimeout);

        process.exit(1);
    }
}

// SIGINT: Ctrl+C
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// SIGTERM: Docker/PM2 等發送的終止信號
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));




