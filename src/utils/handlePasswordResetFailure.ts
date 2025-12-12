// handlePasswordResetFailure.ts

import redis from "../redis/redisClient";

const RESET_LIMIT = 5;                 // 最多允許 5 次失敗
const RESET_LOCK_SECONDS = 15 * 60;    // 鎖 15 分鐘（秒）

// 紀錄並回傳失敗次數
export async function recordResetFailure(userId:number):Promise<number> {
    const key = `reset_pwd_fail:${userId}`;

    const count = await redis.incr(key);

    // 第一次失敗就設定過期時間
    if (count === 1) {
        await redis.expire(key, RESET_LOCK_SECONDS);
    }

    return count;
}

// 檢查user是否被鎖住
export async function checkResetLock (userId:number) {
    const key = `reset_pwd_fail:${userId}`;

    // 查看目前的次數
    const countStr:string | null = await redis.get(key);

    // 沒鎖
    if (!countStr) {
        return {
            locked: false as const,
            remainingSeconds: 0
        }
    }

    const count:number = Number(countStr);

    // 檢查count是否小於5次
    if (Number.isNaN(count) || count < RESET_LIMIT) {
        return {
            locked: false as const,
            remainingSeconds: 0
        }
    }

    // 超過門檻，查看剩餘時間
    const ttl = await redis.ttl(key);

    if (ttl > 0) {
        return {
            locked: true as const,
            remainingSeconds: ttl
        }
    }

    // 其他情況忽略
    return {
        locked: false as const,
        remainingSeconds: 0
    }
}

// 成功重設後，清除紀錄
export async function clearResetFailures (userId:number) {
    const key = `reset_pwd_fail:${userId}`;

    // 刪除key
    await redis.del(key);
}