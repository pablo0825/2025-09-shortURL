import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockOn = vi.fn();
const mockConnect = vi.fn();

const mockRedisInstance = {
    on: mockOn,
    connect: mockConnect,
    isOpen: false,
};

const createClient = vi.fn(() => mockRedisInstance);

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

vi.mock('redis', () => ({
    createClient,
}));

vi.mock('../../src/lib/logger', () => ({
    logger: mockLogger,
}));

describe('redis-client', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env = { ...originalEnv, REDIS_URL: 'redis://127.0.0.1:6379' };
        mockRedisInstance.isOpen = false;
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('should throw when REDIS_URL is missing', async () => {
        delete process.env.REDIS_URL;
        await expect(import('../../src/lib/redis-client')).rejects.toThrow(
            'REDIS_URL is required',
        );
    });

    it('should create redis client and register event handlers', async () => {
        await import('../../src/lib/redis-client');
        expect(createClient).toHaveBeenCalledWith({ url: 'redis://127.0.0.1:6379' });

        const eventNames = mockOn.mock.calls.map((call: unknown[]): unknown => call[0]);
        expect(eventNames).toContain('error');
        expect(eventNames).toContain('connect');
        expect(eventNames).toContain('ready');
        expect(eventNames).toContain('end');
    });

    it('should connect when initRedis called and client is closed', async () => {
        const module = await import('../../src/lib/redis-client');
        await module.initRedis();

        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalledWith('✅ Redis 連接成功');
    });

    it('should skip connect when initRedis called and client already open', async () => {
        const module = await import('../../src/lib/redis-client');
        mockRedisInstance.isOpen = true;

        await module.initRedis();
        expect(mockConnect).not.toHaveBeenCalled();
    });
});
