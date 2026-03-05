import { describe, expect, it } from 'vitest';
import { adminLinksQuerySchema } from '../../src/schemas/admin-schema';

describe('admin-links-query-schema', () => {
    it('should parse valid query', () => {
        const parsed = adminLinksQuerySchema.safeParse({
            page: '1',
            limit: '20',
            sortBy: 'created_at',
            sortOrder: 'desc',
            q: 'abc',
            status: 'active',
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.page).toBe(1);
            expect(parsed.data.limit).toBe(20);
        }
    });

    it('should fail when required query is missing', () => {
        const parsed = adminLinksQuerySchema.safeParse({
            page: 1,
            limit: 20,
            sortOrder: 'desc',
        });

        expect(parsed.success).toBe(false);
    });

    it('should fail when limit is greater than 200', () => {
        const parsed = adminLinksQuerySchema.safeParse({
            page: 1,
            limit: 201,
            sortBy: 'created_at',
            sortOrder: 'desc',
        });

        expect(parsed.success).toBe(false);
    });

    it('should fail when sortBy is invalid', () => {
        const parsed = adminLinksQuerySchema.safeParse({
            page: 1,
            limit: 20,
            sortBy: 'email',
            sortOrder: 'desc',
        });

        expect(parsed.success).toBe(false);
    });

    it('should fail when status is invalid', () => {
        const parsed = adminLinksQuerySchema.safeParse({
            page: 1,
            limit: 20,
            sortBy: 'created_at',
            sortOrder: 'desc',
            status: 'draft',
        });

        expect(parsed.success).toBe(false);
    });
});
