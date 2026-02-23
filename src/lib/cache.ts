import { redisClient } from './redis-client';

export const buildCacheKey = (module: string, identifier: string): string => {
    return `${module}:${identifier}`;
};

export const cacheGet = async (key: string): Promise<string | null> => {
    return redisClient.get(key);
};

export const cacheTtl = async (key: string): Promise<number> => {
    // 設定 key 的過期時間
    return redisClient.ttl(key);
};

export const cacheGetDel = async (key: string): Promise<string | null> => {
    // 取值並刪 key
    return redisClient.getDel(key);
};

export const cacheSet = async (
        key: string,
        value: string,
        ttlSec: number,
): Promise<void> => {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
        throw new Error('ttl 必須是大於 0 的數字');
    }

    await redisClient.set(key, value, { EX: Math.floor(ttlSec) });
};

export const cacheDel = async (key: string): Promise<void> => {
    await redisClient.del(key);
};

export const cacheDelMany = async (keys: string[]): Promise<number> => {
    // 檢查 key 是否為空陣列
    if (!keys.length) {
        return 0;
    }

    // 刪除多個 key
    // unlink 非同步刪除，適合大量刪除
    // 回傳移除　key 的數量
    return redisClient.unlink(keys);
};

export const cacheExists = async (key: string): Promise<boolean> => {
    // 檢查 key 是否存在，1 是存在，0 是不存在
    const count:number = await redisClient.exists(key);

    return count > 0;
};

export const cacheSetNoTtl = async (key: string, value: string): Promise<void> => {
    await redisClient.set(key, value);
};

export const cacheIncr = async (key: string): Promise<number> => {
    // 對 key 做 +1 的計數，並回傳加後的值
    // 可用於 登入失敗次數, rateLimit 計數, 發送驗證碼次數控制
    return redisClient.incr(key);
};

export const cacheExpire = async (key: string, ttlSec: number): Promise<void> => {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
        throw new Error('ttl 必須是大於 0 的數字');
    }

    // 設定 key 的過期時間
    await redisClient.expire(key, Math.floor(ttlSec));
};

export const cacheSetMembers = async (
        key: string,
        members: string[],
        ttlSec?: number,
): Promise<void> => {
    // 先刪除這個 key 在 redis 中的舊資料
    await redisClient.del(key);

    // members 是空陣列，就直接結束
    if (!members.length) {
        return;
    }

    // 把 members 寫入到 set 集合中
    // set 的特性是不會有重複值
    // 但原本 js 的 set 是沒有 key 的，但 redis 中有，所有可以找到相同的 key ，把不同 value 加進去
    await redisClient.sAdd(key, members);

    // ttl 有設定時，才會執行裡面的程式碼
    if (ttlSec !== undefined) {
      // TTL 必須是有效數字，且大於0
      // TTL 不能為 NaN、Infinity、0、負數
        if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
            throw new Error('ttl 必須是大於 0 的數字');
        }

        // 設定 key 的過期時間
        // Math.floor() 向上去整，如：10.8 -> 10
        await redisClient.expire(key, Math.floor(ttlSec));
    }
};

export const cacheIsMember = async (key: string, member: string): Promise<boolean> => {
    // 檢查 redis 的 set 中，有沒有 member 存在，1 表示存在，0 表示不存在
    const result:number = await redisClient.sIsMember(key, member);

    return result > 0;
};

// 帶過期時間的計數器 +1
export const cacheIncrWithTtl = async (
        key: string,
        ttlSec: number,
): Promise<number> => {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
        throw new Error('ttl 必須是大於 0 的數字');
    }

    // 開始收集多個 redis 指令
    const pipeline = redisClient.multi();

    // key 計數，如 +1
    pipeline.incr(key);
    // key 設定過期時間
    pipeline.expire(key, Math.floor(ttlSec));

    // 一次執行所有 redis 指令
    const result = await pipeline.exec();

    // 取得第一個指令的結果，第一個指令是 .incr，所以這裡是拿到加完後的數字
    const incrResult = result?.[0];

    if (typeof incrResult !== 'number') {
        throw new Error('cacheIncrWithTtl 執行失敗');
    }

    return incrResult;
};

// args 是 Redis 指令與參數，如：['EXPIRE(指令)', 'key', '60']
// 函式的回傳型別 = redisClient.sendCommand 的回傳型別
export const cacheSendCommand = (
        args: string[],
): ReturnType<typeof redisClient.sendCommand> => {
    // 把 args 交給 redis client 處理
    // 把 redis 指令交給 redis client 執行，如：SET, GET 等等
    // 再依據指令類型去處理資料
    return redisClient.sendCommand(args);
};

// 檢查 cache 是否啟用
export const cacheIsOpen = (): boolean => {
    return redisClient.isOpen;
};
