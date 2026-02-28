import { describe, expect, it } from 'vitest';
import { linkIdParamSchema, listLinksQuerySchema } from '../../src/schemas/link-schema';

describe('link-schema', () => {
    it('should coerce list query values and apply defaults', () => {
        const result = listLinksQuerySchema.parse({
            page: '2',
            includeExpired: 'true',
        });

        expect(result).toEqual({
            page: 2,
            pageSize: 30,
            includeExpired: true,
            includeInactive: false,
        });
    });

    it('should reject invalid numeric values', () => {
        const result = listLinksQuerySchema.safeParse({
            page: '0',
            pageSize: '999',
            includeExpired: 'no',
        });

        expect(result.success).toBe(false);
    });

    it('should trim and validate numeric link ids', () => {
        const result = linkIdParamSchema.safeParse(' 123 ');

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toBe('123');
        }
    });

    it('should reject invalid link ids', () => {
        const result = linkIdParamSchema.safeParse('abc');

        expect(result.success).toBe(false);
    });
});
