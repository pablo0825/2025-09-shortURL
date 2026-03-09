import { describe, expect, it } from 'vitest';
import {
    adminLinkIdParamSchema,
    adminLinksQuerySchema,
    deactivateAdminLinksBodySchema,
    deleteAdminLinksBodySchema,
} from '../../src/schemas/admin-schema';

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

    it('should parse valid link id param', () => {
        const parsed = adminLinkIdParamSchema.safeParse('101');

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data).toBe(101);
        }
    });

    it('should parse valid delete ids body', () => {
        const parsed = deleteAdminLinksBodySchema.safeParse({
            ids: ['101', '102'],
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.ids).toEqual([101, 102]);
        }
    });

    it('should fail when delete ids body is empty', () => {
        const parsed = deleteAdminLinksBodySchema.safeParse({
            ids: [],
        });

        expect(parsed.success).toBe(false);
    });

    it('should fail when delete ids body exceeds max length', () => {
        const parsed = deleteAdminLinksBodySchema.safeParse({
            ids: Array.from({ length: 51 }, (_, index) => index + 1),
        });

        expect(parsed.success).toBe(false);
    });

    it('should parse valid deactivate ids body', () => {
        const parsed = deactivateAdminLinksBodySchema.safeParse({
            ids: ['101', '102'],
        });

        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.ids).toEqual([101, 102]);
        }
    });

    it('should fail when deactivate ids body is empty', () => {
        const parsed = deactivateAdminLinksBodySchema.safeParse({
            ids: [],
        });

        expect(parsed.success).toBe(false);
    });

    it('should fail when deactivate ids body exceeds max length', () => {
        const parsed = deactivateAdminLinksBodySchema.safeParse({
            ids: Array.from({ length: 51 }, (_, index) => index + 1),
        });

        expect(parsed.success).toBe(false);
    });
});
