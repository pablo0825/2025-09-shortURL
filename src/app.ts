import express, { type Request, type Response, type Router } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { pool } from './db/pool';
import { redirectToLongUrl } from './controllers/link-controllers';
import { errorHandler, notFoundHandler } from './middlewares/error/error-handler';
import { cacheShortUrl } from './middlewares/redirect/cache-short-url';
import { logger } from './lib/logger';

interface AppRouters {
    authRouter: Router;
    linkRouter: Router;
    userRouter: Router;
}

// 把環境變數 CORS_ORIGINS 解析成可用網址的陣列
const getAllowedOrigins = (): string[] => {
    const origins:string = process.env.CORS_ORIGINS ?? '';

    // .trim() 去掉前後空白
    // 過濾空字串
    return origins
            .split(',')
            .map((origin: string): string => origin.trim())
            .filter((origin: string): boolean => origin.length > 0);
};

// 可以改用 cors 套件
const attachCors = (app: ReturnType<typeof express>): void => {
    // 把 .env 的 CORS_ORIGINS 解析字串陣列
    const allowOrigins:string[] = getAllowedOrigins();

    app.use((req: Request, res: Response, next): void => {
        // 跨域請求通常會帶 header
        const origin:string | undefined = req.headers.origin;

        // 任一條件成立就放行
        // 沒有 origin
        // 沒有設定白名單
        // origin 在白名單中
        const isAllowedOrigin:boolean = !origin || allowOrigins.length === 0 || allowOrigins.includes(origin);

        if (!isAllowedOrigin) {
            res.status(403).json({
                ok: false,
                error: 'CORS origin not allowed',
            });

            return;
        }

        // 請求有帶 origin ，才設定以下兩個 header
        if (origin) {
            // 允許這個 origin 存取這次回應，沒有寫死，如:Access-Control-Allow-Origin: http://localhost:5173(可替換)
            res.setHeader('Access-Control-Allow-Origin', origin);
            // 告訴快取，回應內容會隨著 origin 不同而改變
            res.setHeader('Vary', 'Origin');
        }

        // 允許攜帶 cookie/憑證
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        // 允許這些 header 跟著請求送進來
        // Origin：請求來源（瀏覽器自動帶）
        // X-Requested-With：某些前端工具/舊做法會用
        // Content-Type：例如 application/json
        // Accept：告訴伺服器可接受的回應格式
        // Authorization：例如 Bearer token
        res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );

    // 告訴瀏覽器允許哪些方法
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS',);

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);

        return;
    }

    next();

    });
};

export const buildApp = (routers: AppRouters): ReturnType<typeof express> => {
    const app = express();

    app.use(helmet()); // 加上安全性的 http 標頭
    app.use(express.json()); // 讓 api 可以解析 json request body
    app.use(cookieParser()); //解析 cookie
    attachCors(app); // 套用 cors 設定 (跨網域)

    // express.static 的功能是，指定一個資料夾，express 就自動把裡面檔案的網址提供出去，如:http://localhost:3000/static/cat.jpg
    // path.join 組出絕對路徑
    // process.cwd() 獲取根目錄
    // /static 是對外的資料夾名稱
    app.use('/static', express.static(path.join(process.cwd(), 'uploads')));

    app.get('/health', async (_req: Request, res: Response) => {
        try {
            await pool.query('SELECT 1');

            res.status(200).json({
                ok: true,
                db: '連接成功',
                uptime: process.uptime(),
            });
        } catch (err) {
            logger.error('[health] DB connect error', err);

            res.status(500).json({
                ok: false,
                error: '資料庫沒有連接到',
            });
        }
    });

    app.use('/api/link', routers.linkRouter);
    app.use('/api/auth', routers.authRouter);
    app.use('/api/user', routers.userRouter);

    app.get('/:code', cacheShortUrl, redirectToLongUrl);

    // 處理前面沒處理到的錯誤
    // 用來處理找不到路由的情況，返回404
    app.use(notFoundHandler);
    // 處理統一錯誤
    app.use(errorHandler);

    return app;
};
