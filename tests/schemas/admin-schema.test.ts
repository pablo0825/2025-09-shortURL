import { describe, expect, it } from 'vitest';
import { replaceRolePermissionsSchema, usersListSchema } from '../../src/schemas/admin-schema';

describe('admin-schema', () => {
    it('should parse includeInactive and twofa_enabled from string booleans', () => {
        const result = usersListSchema.safeParse({
            includeInactive: 'true',
            twofa_enabled: 'false',
            page: '2',
            limit: '10',
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.includeInactive).toBe(true);
            expect(result.data.twofa_enabled).toBe(false);
            expect(result.data.page).toBe(2);
            expect(result.data.limit).toBe(10);
        }
    });

    it('should fail when includeInactive is not a boolean-like value', () => {
        const result = usersListSchema.safeParse({ includeInactive: 'abc' });

        expect(result.success).toBe(false);
    });

    it('should dedupe duplicated permission items in replaceRolePermissionsSchema', () => {
        const result = replaceRolePermissionsSchema.parse({
            permissions: [
                { module: 'user', type: 'read' },
                { module: 'user', type: 'read' },
                { module: 'user', type: 'write' },
            ],
        });

        expect(result.permissions).toHaveLength(2);
    });
});
