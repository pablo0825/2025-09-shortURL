import { type NextFunction, type Request, type Response, type Router } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeRouter } from '../helpers/router-request';

const getAdminStatsUsers = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getAdminStatsLinks = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getUsers = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getUser = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getUserSessions = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const resetUser2FA = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const deactivateUser = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const restoreUser = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const setUserRole = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getRoles = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getRolePermissions = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getRolePermissionsTree = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const manageRolePermissions = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getAdminLinks = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const getAdminLinkById = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const deactivateAdminLinkById = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const deleteAdminLinkById = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});
const restoreAdminLinks = vi.fn((_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
});

const passThrough = (_req: Request, _res: Response, next: NextFunction): void => next();
const checkPermission = vi.fn(
    (_resource: string, _action: string) =>
        (req: Request, res: Response, next: NextFunction): void => {
            if (req.headers['x-deny'] === '1') {
                res.status(403).json({ ok: false, error: 'Forbidden' });
                return;
            }
            next();
        },
);

vi.mock('../../src/controllers/admin-stats-controllers', () => ({
    getAdminStatsLinks,
    getAdminStatsUsers,
}));

vi.mock('../../src/controllers/admin-user-controllers', () => ({
    deactivateUser,
    getUser,
    getUsers,
    getUserSessions,
    resetUser2FA,
    restoreUser,
    setUserRole,
}));

vi.mock('../../src/controllers/admin-role-controllers', () => ({
    getRolePermissions,
    getRolePermissionsTree,
    getRoles,
    manageRolePermissions,
}));

vi.mock('../../src/controllers/admin-link-controllers', () => ({
    deactivateAdminLinkById,
    deleteAdminLinkById,
    getAdminLinkById,
    getAdminLinks,
    restoreAdminLinks,
}));

vi.mock('../../src/middlewares/auth/check-permission', () => ({
    checkPermission,
}));

vi.mock('../../src/middlewares/auth/authenticate-tokens', () => ({
    authenticate: (req: Request, res: Response, next: NextFunction): void => {
        if (req.headers['x-no-auth'] === '1') {
            res.status(401).json({
                ok: false,
                error: 'unauthorized',
            });
            return;
        }
        req.user = {
            id: '1',
            email: 'admin@example.com',
            name: 'admin',
            role: 'admin',
        };
        next();
    },
}));

vi.mock('../../src/middlewares/rate-limit/rate-limiter', () => ({
    getRateLimiters: () => ({
        generalApiLimiter: passThrough,
    }),
}));

describe('admin-route integration', () => {
    let router: Router;

    beforeAll(async () => {
        const { adminRouter } = await import('../../src/routes/admin-route');
        router = adminRouter;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should route GET /links to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/links?page=1&limit=20&sortBy=created_at&sortOrder=desc',
        });

        expect(response.statusCode).toBe(200);
        expect(getAdminLinks).toHaveBeenCalled();
    });

    it('should route GET /stats/users to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/stats/users',
        });

        expect(response.statusCode).toBe(200);
        expect(getAdminStatsUsers).toHaveBeenCalled();
    });

    it('should route GET /stats/links to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/stats/links',
        });

        expect(response.statusCode).toBe(200);
        expect(getAdminStatsLinks).toHaveBeenCalled();
    });

    it('should route GET /users to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/users?page=1&limit=20&sortBy=created_at&sortOrder=desc',
        });

        expect(response.statusCode).toBe(200);
        expect(getUsers).toHaveBeenCalled();
    });

    it('should route GET /user/:id to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/user/2',
        });

        expect(response.statusCode).toBe(200);
        expect(getUser).toHaveBeenCalled();
    });

    it('should route GET /user/:id/sessions to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/user/2/sessions',
        });

        expect(response.statusCode).toBe(200);
        expect(getUserSessions).toHaveBeenCalled();
    });

    it('should route PATCH /user/:id/reset-2fa to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/user/2/reset-2fa',
        });

        expect(response.statusCode).toBe(200);
        expect(resetUser2FA).toHaveBeenCalled();
    });

    it('should route PATCH /user/:id/deactivate to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/user/2/deactivate',
        });

        expect(response.statusCode).toBe(200);
        expect(deactivateUser).toHaveBeenCalled();
    });

    it('should route PATCH /user/:id/restore to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/user/3/restore',
        });

        expect(response.statusCode).toBe(200);
        expect(restoreUser).toHaveBeenCalled();
    });

    it('should route PUT /users/:id/role to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PUT',
            url: '/users/2/role',
        });

        expect(response.statusCode).toBe(200);
        expect(setUserRole).toHaveBeenCalled();
    });

    it('should route GET /roles to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/roles',
        });

        expect(response.statusCode).toBe(200);
        expect(getRoles).toHaveBeenCalled();
    });

    it('should route GET /roles/:roleId/permissions to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/roles/2/permissions',
        });

        expect(response.statusCode).toBe(200);
        expect(getRolePermissions).toHaveBeenCalled();
    });

    it('should route GET /roles/:roleId/permissions/tree to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/roles/2/permissions/tree',
        });

        expect(response.statusCode).toBe(200);
        expect(getRolePermissionsTree).toHaveBeenCalled();
    });

    it('should route PATCH /roles/:roleId/permissions to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/roles/2/permissions',
        });

        expect(response.statusCode).toBe(200);
        expect(manageRolePermissions).toHaveBeenCalled();
    });

    it('should route GET /links/:id to detail controller', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/links/101',
        });

        expect(response.statusCode).toBe(200);
        expect(getAdminLinkById).toHaveBeenCalled();
    });

    it('should route PATCH /links/deactivate to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/links/deactivate',
        });

        expect(response.statusCode).toBe(200);
        expect(deactivateAdminLinkById).toHaveBeenCalled();
    });

    it('should route DELETE /links to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'DELETE',
            url: '/links',
        });

        expect(response.statusCode).toBe(200);
        expect(deleteAdminLinkById).toHaveBeenCalled();
    });

    it('should route PATCH /links/restore to controller', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/links/restore',
        });

        expect(response.statusCode).toBe(200);
        expect(restoreAdminLinks).toHaveBeenCalled();
    });

    it('should stop at authenticate middleware when unauthorized', async () => {
        const response = await invokeRouter(router, {
            method: 'PATCH',
            url: '/links/deactivate',
            headers: { 'x-no-auth': '1' },
        });

        expect(response.statusCode).toBe(401);
        expect(deactivateAdminLinkById).not.toHaveBeenCalled();
    });

    it('should stop at permission middleware when forbidden', async () => {
        const response = await invokeRouter(router, {
            method: 'GET',
            url: '/stats/links',
            headers: { 'x-deny': '1' },
        });

        expect(response.statusCode).toBe(403);
        expect(getAdminStatsLinks).not.toHaveBeenCalled();
    });
});
