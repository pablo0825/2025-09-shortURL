import { describe, expect, it } from 'vitest';
import { longUrlSchema } from '../../src/schemas/long-url-schema';

describe('long-url-schema', () => {
    const schema = longUrlSchema({
        allowHash: true,
        stripTrackingParams: true,
        maxLength: 2048,
    });

    it('should return success false instead of throwing for invalid scheme', () => {
        const run = () => schema.safeParse('javascript:alert(1)');

        expect(run).not.toThrow();

        const result = run();
        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error('expected invalid result');
        }

        expect(result.error.issues[0]?.message).toBe('只支援http, https，其他都拒絕');
    });

    it('should normalize a valid url', () => {
        const result = schema.safeParse('https://Example.com:443/path//to?a=1&utm_source=ads');

        expect(result.success).toBe(true);
        if (!result.success) {
            throw new Error('expected valid result');
        }

        expect(result.data).toBe('https://example.com/path/to?a=1');
    });

    it('should return success false when url contains credentials', () => {
        const result = schema.safeParse('https://user:pass@example.com/path');

        expect(result.success).toBe(false);
        if (result.success) {
            throw new Error('expected invalid result');
        }

        expect(result.error.issues[0]?.message).toBe('不允許包含認證資訊的URL');
    });
});
