import { createClient } from 'redis';
import { logger } from './logger';

if (!process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required');
}

export const redisClient = createClient({
    url: process.env.REDIS_URL,
});

// .on(事件名稱, 處理函式)
// .on 註冊事件監聽器
// unknown 是 ts 的型別，意思是我知道這裡有值，但目前不知道它的型別
// 跟 any 的差別是，unknown 需要先確認，在用，但 any 是不管了，先用在說
redisClient.on('error', (err: unknown) => {
    logger.error('❌ Redis Client Error:', err);
});

redisClient.on('connect', () => {
    logger.info('🔄 Redis 正在連接...');
});

redisClient.on('ready', () => {
    logger.info('✅ Redis 已就緒');
});

redisClient.on('end', () => {
    logger.warn('⚠️ Redis 連線已關閉');
});

// redis 初始化
// 需要初始化的原因是，因為 reteLimiter 限速器需要用到 redis ，所以需要先處理這部分
export async function initRedis(): Promise<void> {
    try {
        // .isOpen 檢查 redis 有沒有連線
        if (!redisClient.isOpen) {
            // .connect() 連接
            await redisClient.connect();
            logger.info('✅ Redis 連接成功');
        }
    } catch (err: unknown) {
        logger.error('❌ Redis 連接失敗:', err);
        throw err;
    }
}
