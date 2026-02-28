import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/db/pool', () => ({
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('../../src/repositories/admin/user-repository', () => ({
    countUsersByWhereSql: vi.fn(),
    findActiveSessionsByUserId: vi.fn(),
    findRolesByUserIds: vi.fn(),
    findUserById: vi.fn(),
    findUsersByWhereSql: vi.fn(),
    disableUserTwofaState: vi.fn(),
    findActiveUserForDeactivateForUpdate: vi.fn(),
    findActiveUserTwofaStateForUpdate: vi.fn(),
    findInactiveUserForRestoreForUpdate: vi.fn(),
    restoreInactiveUser: vi.fn(),
    revokeAllBackupCodes: vi.fn(),
    revokeBackupCodesByVersion: vi.fn(),
    revokeRefreshTokensByUserId: vi.fn(),
    revokeSessionsByUserId: vi.fn(),
    softDeleteActiveUser: vi.fn(),
}));

import { pool } from '../../src/db/pool';
import {
    countUsersByWhereSql,
    disableUserTwofaState,
    findActiveSessionsByUserId,
    findActiveUserForDeactivateForUpdate,
    findActiveUserTwofaStateForUpdate,
    findInactiveUserForRestoreForUpdate,
    findRolesByUserIds,
    findUserById,
    findUsersByWhereSql,
    restoreInactiveUser,
    revokeAllBackupCodes,
    revokeBackupCodesByVersion,
    revokeRefreshTokensByUserId,
    revokeSessionsByUserId,
    softDeleteActiveUser,
} from '../../src/repositories/admin/user-repository';
import {
    deactivateUserService,
    getUserService,
    getUsersService,
    getUserSessionsService,
    resetUser2faService,
    restoreUserService,
} from '../../src/services/admin/admin-user-service';

const queryMock = vi.fn();
const releaseMock = vi.fn();
const fakeClient = { query: queryMock, release: releaseMock };

const mockedPool = vi.mocked(pool);
const mockedCountUsersByWhereSql = vi.mocked(countUsersByWhereSql);
const mockedFindUsersByWhereSql = vi.mocked(findUsersByWhereSql);
const mockedFindRolesByUserIds = vi.mocked(findRolesByUserIds);
const mockedFindUserById = vi.mocked(findUserById);
const mockedFindActiveSessionsByUserId = vi.mocked(findActiveSessionsByUserId);
const mockedFindActiveUserTwofaStateForUpdate = vi.mocked(findActiveUserTwofaStateForUpdate);
const mockedDisableUserTwofaState = vi.mocked(disableUserTwofaState);
const mockedRevokeBackupCodesByVersion = vi.mocked(revokeBackupCodesByVersion);
const mockedRevokeRefreshTokensByUserId = vi.mocked(revokeRefreshTokensByUserId);
const mockedRevokeSessionsByUserId = vi.mocked(revokeSessionsByUserId);
const mockedFindActiveUserForDeactivateForUpdate = vi.mocked(findActiveUserForDeactivateForUpdate);
const mockedSoftDeleteActiveUser = vi.mocked(softDeleteActiveUser);
const mockedRevokeAllBackupCodes = vi.mocked(revokeAllBackupCodes);
const mockedFindInactiveUserForRestoreForUpdate = vi.mocked(findInactiveUserForRestoreForUpdate);
const mockedRestoreInactiveUser = vi.mocked(restoreInactiveUser);

describe('admin-user-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedPool.connect.mockResolvedValue(fakeClient as never);
        queryMock.mockResolvedValue({ rowCount: 1 });
    });

    it('should return user list with pagination and merged roles', async () => {
        mockedCountUsersByWhereSql.mockResolvedValue(2);
        mockedFindUsersByWhereSql.mockResolvedValue([
            {
                id: 1,
                email: 'a@x.com',
                nickname: 'a',
                is_active: true,
                last_login_at: null,
                twofa_enabled: true,
            },
            {
                id: 2,
                email: 'b@x.com',
                nickname: 'b',
                is_active: false,
                last_login_at: null,
                twofa_enabled: false,
            },
        ]);
        mockedFindRolesByUserIds.mockResolvedValue([
            { user_id: 1, type: 'admin' },
            { user_id: 2, type: 'user' },
        ]);

        const result = await getUsersService({
            page: 1,
            limit: 20,
            sortBy: 'created_at',
            sortOrder: 'desc',
            includeInactive: true,
        });

        expect(result.pagination.total).toBe(2);
        expect(result.data[0].role).toEqual(['admin']);
        expect(result.data[1].role).toEqual(['user']);
    });

    it('should rollback and wrap error when getUsers query fails', async () => {
        mockedCountUsersByWhereSql.mockRejectedValue(new Error('db down'));

        await expect(
            getUsersService({
                page: 1,
                limit: 20,
                sortBy: 'bad_field' as never,
                sortOrder: 'weird' as never,
                includeInactive: false,
            }),
        ).rejects.toMatchObject({
            message: '[adminUserService.getUsers] db down',
        });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
        expect(releaseMock).toHaveBeenCalled();
    });

    it('should throw UserNotFoundError when getUser target does not exist', async () => {
        mockedFindUserById.mockResolvedValue(null);

        await expect(getUserService(99)).rejects.toMatchObject({ name: 'UserNotFoundError' });
    });

    it('should return user when getUser target exists', async () => {
        mockedFindUserById.mockResolvedValue({ id: 9, email: 'u@example.com' } as never);

        const result = await getUserService(9);

        expect(result).toEqual({ id: 9, email: 'u@example.com' });
    });

    it('should mark session status correctly', async () => {
        const now = Date.now();
        mockedFindActiveSessionsByUserId.mockResolvedValue([
            {
                id: 1,
                last_seen_at: new Date(now - 31 * 24 * 60 * 60 * 1000),
                expires_at: new Date(now + 10_000),
                user_agent: 'ua1',
                ip_address: '1.1.1.1',
                device_info: 'd1',
            },
            {
                id: 2,
                last_seen_at: new Date(now - 1_000),
                expires_at: new Date(now - 1_000),
                user_agent: 'ua2',
                ip_address: '2.2.2.2',
                device_info: 'd2',
            },
        ]);

        const result = await getUserSessionsService(7);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].status).toBe('inactive');
        expect(result.data[1].status).toBe('expired');
    });

    it('should return empty session list message when no sessions exist', async () => {
        mockedFindActiveSessionsByUserId.mockResolvedValue([]);

        const result = await getUserSessionsService(7);

        expect(result).toEqual({
            message: '尚無裝置紀錄',
            data: [],
        });
    });

    it('should mark active sessions correctly', async () => {
        const now = Date.now();
        mockedFindActiveSessionsByUserId.mockResolvedValue([
            {
                id: 3,
                last_seen_at: new Date(now - 1_000),
                expires_at: new Date(now + 10_000),
                user_agent: 'ua3',
                ip_address: '3.3.3.3',
                device_info: 'd3',
            },
        ]);

        const result = await getUserSessionsService(7);

        expect(result.data[0].status).toBe('active');
    });

    it('should throw UserNotFoundError when resetting 2fa for missing user', async () => {
        mockedFindActiveUserTwofaStateForUpdate.mockResolvedValue(null);

        await expect(resetUser2faService(7)).rejects.toMatchObject({ name: 'UserNotFoundError' });
    });

    it('should reset user 2fa successfully', async () => {
        mockedFindActiveUserTwofaStateForUpdate.mockResolvedValue({
            twofa_backup_codes_version: 5,
            twofa_enabled: true,
            twofa_enabled_at: '2026-01-01',
        });
        mockedDisableUserTwofaState.mockResolvedValue({
            twofa_backup_codes_version: 0,
            twofa_enabled: false,
            twofa_enabled_at: null,
        });
        mockedRevokeBackupCodesByVersion.mockResolvedValue(3);
        mockedRevokeRefreshTokensByUserId.mockResolvedValue(2);
        mockedRevokeSessionsByUserId.mockResolvedValue(2);

        const result = await resetUser2faService(7);

        expect(result.before.twofa_backup_codes_version).toBe(5);
        expect(result.after.twofa_backup_codes_version).toBe(0);
        expect(result.affected.sessions_revoked).toBe(2);
        expect(queryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw UserNotFoundError when resetUser2fa update returns null', async () => {
        mockedFindActiveUserTwofaStateForUpdate.mockResolvedValue({
            twofa_backup_codes_version: 5,
            twofa_enabled: true,
            twofa_enabled_at: '2026-01-01',
        });
        mockedDisableUserTwofaState.mockResolvedValue(null);

        await expect(resetUser2faService(7)).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should deactivate user successfully', async () => {
        mockedFindActiveUserForDeactivateForUpdate.mockResolvedValue({
            is_active: true,
            deleted_at: null,
            twofa_enabled: true,
            twofa_enabled_at: '2026-01-01',
            twofa_backup_codes_version: 1,
        });
        mockedSoftDeleteActiveUser.mockResolvedValue({
            is_active: false,
            deleted_at: '2026-02-01',
            twofa_enabled: false,
            twofa_enabled_at: null,
            twofa_backup_codes_version: 0,
        });
        mockedRevokeAllBackupCodes.mockResolvedValue(2);
        mockedRevokeRefreshTokensByUserId.mockResolvedValue(2);
        mockedRevokeSessionsByUserId.mockResolvedValue(2);

        const result = await deactivateUserService(8);

        expect(result.after.is_active).toBe(false);
        expect(result.affected.user_backup_codes_revoked).toBe(2);
        expect(result.affected.sessions_revoked).toBe(2);
    });

    it('should throw UserNotFoundError when deactivating missing user', async () => {
        mockedFindActiveUserForDeactivateForUpdate.mockResolvedValue(null);

        await expect(deactivateUserService(8)).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw UserNotFoundError when deactivate update returns null', async () => {
        mockedFindActiveUserForDeactivateForUpdate.mockResolvedValue({
            is_active: true,
            deleted_at: null,
            twofa_enabled: true,
            twofa_enabled_at: '2026-01-01',
            twofa_backup_codes_version: 1,
        });
        mockedSoftDeleteActiveUser.mockResolvedValue(null);

        await expect(deactivateUserService(8)).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should restore inactive user successfully', async () => {
        mockedFindInactiveUserForRestoreForUpdate.mockResolvedValue({
            is_active: false,
            deleted_at: '2026-01-20',
            twofa_enabled: false,
        });
        mockedRestoreInactiveUser.mockResolvedValue({
            is_active: true,
            deleted_at: null,
            twofa_enabled: false,
        });

        const result = await restoreUserService(8);

        expect(result.before.is_active).toBe(false);
        expect(result.after.is_active).toBe(true);
        expect(result.affected.users_updated).toBe(1);
    });

    it('should throw UserNotFoundError when restoring missing user', async () => {
        mockedFindInactiveUserForRestoreForUpdate.mockResolvedValue(null);

        await expect(restoreUserService(8)).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw UserNotFoundError when restore update returns null', async () => {
        mockedFindInactiveUserForRestoreForUpdate.mockResolvedValue({
            is_active: false,
            deleted_at: '2026-01-20',
            twofa_enabled: false,
        });
        mockedRestoreInactiveUser.mockResolvedValue(null);

        await expect(restoreUserService(8)).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });
});
