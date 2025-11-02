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

// 嘗試連線
// (async () => {})() 自執行的匿名異步函式
// 方法：匿名()
// 連線時自動執行函式
(async () => {
    try {
        await redis.connect(); //連線
        await redis.ping(); // 檢查連線是否正常
        console.log("✅ Redis 連線成功!");
    } catch (err) {
        console.error("❌ Redis connection failed:", err);
    }
})();

export default redis;