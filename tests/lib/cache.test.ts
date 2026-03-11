import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPipeline, mockRedisClient } = vi.hoisted(() => {
    const pipeline = {
        incr: vi.fn(),
        expire: vi.fn(),
        exec: vi.fn(),
    };

    const redisClient = {
        get: vi.fn(),
        ttl: vi.fn(),
        getDel: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        unlink: vi.fn(),
        exists: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        sAdd: vi.fn(),
        sIsMember: vi.fn(),
        sendCommand: vi.fn(),
        multi: vi.fn(() => pipeline),
        isOpen: true,
    };

    return { mockPipeline: pipeline, mockRedisClient: redisClient };
});

vi.mock('../../src/lib/redis-client', () => ({
    redisClient: mockRedisClient,
}));

import {
    buildCacheKey,
    cacheDel,
    cacheDelMany,
    cacheExists,
    cacheExpire,
    cacheGet,
    cacheGetDel,
    cacheIncrWithTtl,
    cacheIncr,
    cacheIsMember,
    cacheIsOpen,
    cacheSendCommand,
    cacheSet,
    cacheSetMembers,
    cacheTtl,
} from '../../src/lib/cache';

describe('cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should build cache key with module prefix', () => {
        const key = buildCacheKey('url', 'abc123');
        expect(key).toBe('url:abc123');
    });

    it('should set cache with floored ttl', async () => {
        await cacheSet('key-1', 'value-1', 10.9);
        expect(mockRedisClient.set).toHaveBeenCalledWith('key-1', 'value-1', { EX: 10 });
    });

    it('should throw when cacheSet ttl is invalid', async () => {
        await expect(cacheSet('key-1', 'value-1', 0)).rejects.toThrow('ttl 必須是大於 0 的數字');
    });

    it('should return false when key does not exist', async () => {
        mockRedisClient.exists.mockResolvedValue(0);
        const result = await cacheExists('key-1');
        expect(result).toBe(false);
    });

    it('should get cache value', async () => {
        mockRedisClient.get.mockResolvedValue('value-1');
        const result = await cacheGet('key-1');
        expect(result).toBe('value-1');
    });

    it('should get ttl value', async () => {
        mockRedisClient.ttl.mockResolvedValue(60);
        const result = await cacheTtl('key-1');
        expect(result).toBe(60);
    });

    it('should get and delete cache value', async () => {
        mockRedisClient.getDel.mockResolvedValue('value-1');
        const result = await cacheGetDel('key-1');
        expect(result).toBe('value-1');
    });

    it('should delete a cache key', async () => {
        await cacheDel('key-1');
        expect(mockRedisClient.del).toHaveBeenCalledWith('key-1');
    });

    it('should increment cache key', async () => {
        mockRedisClient.incr.mockResolvedValue(2);
        const result = await cacheIncr('count-key');
        expect(result).toBe(2);
    });

    it('should set cache expiry with floored ttl', async () => {
        await cacheExpire('key-1', 3.9);
        expect(mockRedisClient.expire).toHaveBeenCalledWith('key-1', 3);
    });

    it('should throw when cacheExpire ttl is invalid', async () => {
        await expect(cacheExpire('key-1', -1)).rejects.toThrow('ttl 必須是大於 0 的數字');
    });

    it('should clear and repopulate set members with ttl', async () => {
        await cacheSetMembers('set-key', ['a', 'b'], 5.8);
        expect(mockRedisClient.del).toHaveBeenCalledWith('set-key');
        expect(mockRedisClient.sAdd).toHaveBeenCalledWith('set-key', ['a', 'b']);
        expect(mockRedisClient.expire).toHaveBeenCalledWith('set-key', 5);
    });

    it('should skip set population when members are empty', async () => {
        await cacheSetMembers('set-key', []);
        expect(mockRedisClient.del).toHaveBeenCalledWith('set-key');
        expect(mockRedisClient.sAdd).not.toHaveBeenCalled();
    });

    it('should throw when cacheSetMembers ttl is invalid', async () => {
        await expect(cacheSetMembers('set-key', ['a'], 0)).rejects.toThrow('ttl 必須是大於 0 的數字');
    });

    it('should return zero for cacheDelMany when no keys provided', async () => {
        const deleted = await cacheDelMany([]);
        expect(deleted).toBe(0);
        expect(mockRedisClient.unlink).not.toHaveBeenCalled();
    });

    it('should increment with ttl through pipeline', async () => {
        mockPipeline.exec.mockResolvedValue([3, true]);
        const value = await cacheIncrWithTtl('count-key', 10);
        expect(value).toBe(3);
        expect(mockPipeline.incr).toHaveBeenCalledWith('count-key');
        expect(mockPipeline.expire).toHaveBeenCalledWith('count-key', 10);
    });

    it('should throw when cacheIncrWithTtl pipeline result is invalid', async () => {
        mockPipeline.exec.mockResolvedValue(['bad']);
        await expect(cacheIncrWithTtl('count-key', 10)).rejects.toThrow('cacheIncrWithTtl 執行失敗');
    });

    it('should check set membership', async () => {
        mockRedisClient.sIsMember.mockResolvedValue(1);
        const result = await cacheIsMember('set-key', 'a');
        expect(result).toBe(true);
    });

    it('should proxy sendCommand', () => {
        mockRedisClient.sendCommand.mockReturnValue('ok');
        const result = cacheSendCommand(['PING']);
        expect(result).toBe('ok');
        expect(mockRedisClient.sendCommand).toHaveBeenCalledWith(['PING']);
    });

    it('should return cache open status', () => {
        expect(cacheIsOpen()).toBe(true);
    });
});
