import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-role-service', () => ({
    getRolePermissionsService: vi.fn(),
    getRolePermissionsTreeService: vi.fn(),
    getRolesService: vi.fn(),
    manageRolePermissionsService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

import {
    getRolePermissions as rawGetRolePermissions,
    getRolePermissionsTree as rawGetRolePermissionsTree,
    getRoles as rawGetRoles,
    manageRolePermissions as rawManageRolePermissions,
} from '../../src/controllers/admin-role-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import {
    getRolePermissionsService,
    getRolePermissionsTreeService,
    getRolesService,
    manageRolePermissionsService,
} from '../../src/services/admin/admin-role-service';
import { recordAdminAuditLogService } from '../../src/services/admin/admin-audit-log-service';
import { logger } from '../../src/lib/logger';
import { AppError } from '../../src/utils/app-error';

const mockedGetRolesService = vi.mocked(getRolesService);
const mockedGetRolePermissionsService = vi.mocked(getRolePermissionsService);
const mockedGetRolePermissionsTreeService = vi.mocked(getRolePermissionsTreeService);
const mockedManageRolePermissionsService = vi.mocked(manageRolePermissionsService);
const mockedRecordAdminAuditLogService = vi.mocked(recordAdminAuditLogService);

type AdminController = (req: never, res: never, next?: (err?: unknown) => void) => Promise<unknown>;

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    return { status, json, headersSent: false };
};

const withErrorHandler = (handler: AdminController) => {
    return async (req: never, res: ReturnType<typeof buildRes>): Promise<void> => {
        const next = (err?: unknown): void => {
            if (err) {
                errorHandler(err, req, res as never, vi.fn());
            }
        };

        await handler(req, res as never, next);
    };
};

const getRoles = withErrorHandler(rawGetRoles);
const getRolePermissions = withErrorHandler(rawGetRolePermissions);
const getRolePermissionsTree = withErrorHandler(rawGetRolePermissionsTree);
const manageRolePermissions = withErrorHandler(rawManageRolePermissions);

describe('admin-role-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    it('should return 200 in getRoles', async () => {
        mockedGetRolesService.mockResolvedValue([{ id: 1, type: 'admin' }]);
        const req = { user: { id: 1, role: 'admin' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRoles(req, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in getRoles when service fails', async () => {
        mockedGetRolesService.mockRejectedValue(new Error('db down'));
        const req = { user: { id: 1, role: 'admin' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRoles(req, res as never);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 403 in getRolePermissions when role is assistant', async () => {
        const req = { user: { id: 1, role: 'assistant' }, params: { roleId: '2' } } as never;
        const res = buildRes();
        await getRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 in getRolePermissions when role does not exist', async () => {
        mockedGetRolePermissionsService.mockResolvedValue({ roleExists: false, permissions: [] });
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 in getRolePermissions when role id is invalid', async () => {
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: 'bad' } } as never;
        const res = buildRes();
        await getRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in getRolePermissions when role exists', async () => {
        mockedGetRolePermissionsService.mockResolvedValue({ roleExists: true, permissions: [{ module: 'user', type: 'read' }] } as never);
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in getRolePermissions when service fails', async () => {
        mockedGetRolePermissionsService.mockRejectedValue(new Error('db down'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 200 in getRolePermissionsTree when role exists', async () => {
        mockedGetRolePermissionsTreeService.mockResolvedValue({ roleExists: true, data: [] });
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions/tree', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissionsTree(req, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 in getRolePermissionsTree when role does not exist', async () => {
        mockedGetRolePermissionsTreeService.mockResolvedValue({ roleExists: false, data: [] });
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions/tree', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissionsTree(req, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 500 in getRolePermissionsTree when service fails', async () => {
        mockedGetRolePermissionsTreeService.mockRejectedValue(new Error('db down'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions/tree', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await getRolePermissionsTree(req, res as never);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 400 in manageRolePermissions when body is invalid', async () => {
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: 'invalid', version: 5 } } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 in manageRolePermissions when role id is invalid', async () => {
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: 'bad' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 1 } } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 in manageRolePermissions when service succeeds', async () => {
        mockedManageRolePermissionsService.mockResolvedValue({ roleType: 'admin', beforeVersion: 1, afterVersion: 2, affected: { added: 1, removed: 0 }, reason: 'sync' } as never);
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], reason: 'sync', version: 1 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should warn when success audit log write fails in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockResolvedValue({ roleType: 'admin', beforeVersion: 1, afterVersion: 2, affected: { added: 1, removed: 0 }, reason: 'sync' } as never);
        mockedRecordAdminAuditLogService.mockRejectedValueOnce(new Error('audit down'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], reason: 'sync', version: 1 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        await Promise.resolve();
        expect(logger.warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error));
    });

    it('should map RoleNotFoundError to 404 in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new AppError(404, 'missing', 'RoleNotFoundError'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 5 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should map RoleVersionConflictError to 409 in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new AppError(409, 'version conflict', 'RoleVersionConflictError'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 5 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(409);
    });

    it('should map PermissionNotFoundError to 422 in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new AppError(422, 'missing', 'PermissionNotFoundError'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 5 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(422);
    });

    it('should return 500 in manageRolePermissions when service fails unexpectedly', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new Error('db down'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 5 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should warn when failed audit log write fails in manageRolePermissions', async () => {
        mockedManageRolePermissionsService.mockRejectedValue(new Error('db down'));
        mockedRecordAdminAuditLogService.mockRejectedValueOnce(new Error('audit down'));
        const req = { user: { id: 1, role: 'admin' }, params: { roleId: '2' }, body: { permissions: [{ module: 'user', type: 'read' }], version: 5 }, get: vi.fn().mockReturnValue('ua'), originalUrl: '/admin/roles/2/permissions', ip: '1.1.1.1' } as never;
        const res = buildRes();
        await manageRolePermissions(req, res as never);
        await Promise.resolve();
        expect(logger.warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error));
    });
});
