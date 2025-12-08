import { createClient } from "redis";

// 確保環境變數
if(!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required");
}

// 從環境變數讀取 redis_url
const redis = createClient({
    // as string 斷言
    url: process.env.REDIS_URL as string || "redis://localhost:6379"
});

// 監聽錯誤事件
redis.on("error", (err) => {
    console.error("❌ Redis Client Error:", err);
});

redis.on('connect', () => {
    console.log('🔄 Redis 正在連接...');
});

redis.on('ready', () => {
    console.log('✅ Redis 已就緒');
});

redis.on('end', () => {
    console.log('⚠️ Redis 連線已關閉');
});

// 嘗試連線
// (async () => {})() 自執行的匿名異步函式
// 方法：匿名()
// 連線時自動執行函式
// (async () => {
//     try {
//         await redis.connect(); //連線
//         await redis.ping(); // 檢查連線是否正常
//         console.log("✅ Redis 連線成功!");
//     } catch (err) {
//         console.error("❌ Redis connection failed:", err);
//     }
// })();

export async function initRedis() {
    try {
        if (!redis.isOpen) {
            // 連線
            await redis.connect();
            console.log("✅ Redis 連接成功");
        }
    } catch (err) {
        console.error("❌ Redis 連接失敗:", err);
        // 向上拋出錯誤,讓 bootstrap 捕獲
        throw err;
    }
}

export default redis;