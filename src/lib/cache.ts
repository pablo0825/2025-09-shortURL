import { redisClient } from './redis-client';

export const buildCacheKey = (module: string, identifier: string): string => {
  return `${module}:${identifier}`;
};

export const cacheGet = async (key: string): Promise<string | null> => {
  return redisClient.get(key);
};

export const cacheTtl = async (key: string): Promise<number> => {
  return redisClient.ttl(key);
};

export const cacheGetDel = async (key: string): Promise<string | null> => {
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
  if (!keys.length) {
    return 0;
  }
  return redisClient.unlink(keys);
};

export const cacheExists = async (key: string): Promise<boolean> => {
  const count = await redisClient.exists(key);
  return count > 0;
};

export const cacheSetNoTtl = async (key: string, value: string): Promise<void> => {
  await redisClient.set(key, value);
};

export const cacheIncr = async (key: string): Promise<number> => {
  return redisClient.incr(key);
};

export const cacheExpire = async (key: string, ttlSec: number): Promise<void> => {
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    throw new Error('ttl 必須是大於 0 的數字');
  }
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
  const result = await redisClient.sIsMember(key, member);
  return result > 0;
};

export const cacheIncrWithTtl = async (
  key: string,
  ttlSec: number,
): Promise<number> => {
  if (!Number.isFinite(ttlSec) || ttlSec <= 0) {
    throw new Error('ttl 必須是大於 0 的數字');
  }

  const pipeline = redisClient.multi();
  pipeline.incr(key);
  pipeline.expire(key, Math.floor(ttlSec));
  const result = await pipeline.exec();

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
