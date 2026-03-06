import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
    cacheSetMembers: vi.fn(),
}));

vi.mock('../../src/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../src/repositories/admin/role-repository', () => ({
    findRolesWithPermissionsForRbac: vi.fn(),
}));

import { cacheSetMembers } from '../../src/lib/cache';
import { findRolesWithPermissionsForRbac } from '../../src/repositories/admin/role-repository';
import { loadRbacFromDb } from '../../src/rbac/load-rbac-from-db';

const mockedCacheSetMembers = vi.mocked(cacheSetMembers);
const mockedFindRolesWithPermissionsForRbac = vi.mocked(findRolesWithPermissionsForRbac);

describe('load-rbac-from-db', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should write role permissions to redis with ttl', async () => {
        mockedFindRolesWithPermissionsForRbac.mockResolvedValue([
            { role_id: 1, role_type: 'admin', module: 'user', type: 'read' },
            { role_id: 1, role_type: 'admin', module: 'user', type: 'write' },
            { role_id: 2, role_type: 'assistant', module: null, type: null },
        ]);

        await loadRbacFromDb();

        expect(mockedCacheSetMembers).toHaveBeenCalledWith(
            'role:admin:permissions',
            ['user:read', 'user:write'],
            86400,
        );
        expect(mockedCacheSetMembers).toHaveBeenCalledWith('role:assistant:permissions', [], 86400);
    });

    it('should throw when no roles are returned from repository', async () => {
        mockedFindRolesWithPermissionsForRbac.mockResolvedValue([]);

        await expect(loadRbacFromDb()).rejects.toThrow('[RBAC] no roles found from database');
    });

    it('should retry once and then succeed', async () => {
        vi.useFakeTimers();
        try {
            mockedFindRolesWithPermissionsForRbac
                .mockRejectedValueOnce(new Error('db down'))
                .mockResolvedValueOnce([
                    { role_id: 1, role_type: 'admin', module: 'user', type: 'read' },
                ]);

            const assertion = expect(loadRbacFromDb(2)).resolves.toBeUndefined();
            await vi.runAllTimersAsync();
            await assertion;

            expect(mockedFindRolesWithPermissionsForRbac).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('should throw after max retries', async () => {
        vi.useFakeTimers();
        try {
            mockedFindRolesWithPermissionsForRbac.mockRejectedValue(new Error('db down'));

            const assertion = expect(loadRbacFromDb(2)).rejects.toThrow('db down');
            await vi.runAllTimersAsync();
            await assertion;

            expect(mockedFindRolesWithPermissionsForRbac).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
