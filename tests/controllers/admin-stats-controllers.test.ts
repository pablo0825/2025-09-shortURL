import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/admin/admin-stats-service', () => ({
    getAdminStatsLinksService: vi.fn(),
    getAdminStatsUsersService: vi.fn(),
}));

vi.mock('../../src/services/admin/admin-audit-log-service', () => ({
    recordAdminAuditLogService: vi.fn().mockResolvedValue(undefined),
}));

import { getAdminStatsLinks, getAdminStatsUsers } from '../../src/controllers/admin-stats-controllers';
import { errorHandler } from '../../src/middlewares/error/error-handler';
import { logger } from '../../src/lib/logger';
import { getAdminStatsLinksService, getAdminStatsUsersService } from '../../src/services/admin/admin-stats-service';

const mockedGetAdminStatsLinksService = vi.mocked(getAdminStatsLinksService);
const mockedGetAdminStatsUsersService = vi.mocked(getAdminStatsUsersService);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    return { status, json, headersSent: false };
};

describe('admin-stats-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(logger, 'error').mockImplementation(() => undefined);
        vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    });

    const invokeWithErrorHandler = async (
        req: never,
        res: ReturnType<typeof buildRes>,
    ): Promise<void> => {
        const next = (err?: unknown): void => {
            if (!err) {
                return;
            }

            errorHandler(err, req, res as never, vi.fn());
        };

        await getAdminStatsUsers(req, res as never, next);
    };

    const invokeLinksWithErrorHandler = async (
        req: never,
        res: ReturnType<typeof buildRes>,
    ): Promise<void> => {
        const next = (err?: unknown): void => {
            if (!err) {
                return;
            }

            errorHandler(err, req, res as never, vi.fn());
        };

        await getAdminStatsLinks(req, res as never, next);
    };

    it('should return 200 when service succeeds', async () => {
        mockedGetAdminStatsUsersService.mockResolvedValue({
            daily: Array.from({ length: 7 }, (_, index) => ({
                date: `2026-03-0${index + 4}`,
                dau: index,
                newUsers: index,
                linkCreators: index,
            })),
            summary: {
                wau: 100,
                twoFaRate: 0.62,
                deactivatedThisWeek: 2,
            },
        });

        const req = {
            user: { id: 1, role: 'admin' },
            originalUrl: '/admin/stats/users',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 200 when get admin stats links succeeds', async () => {
        mockedGetAdminStatsLinksService.mockResolvedValue({
            summary: {
                totalLinks: 320,
                byStatus: {
                    active: 210,
                    expired: 60,
                    disabled: 30,
                    deleted: 20,
                },
                newLinksToday: 8,
            },
            dailyClicks: Array.from({ length: 7 }, (_, index) => ({
                date: `2026-03-0${index + 4}`,
                clicks: index * 10,
            })),
            topReferers: [{ domain: 'google.com', clicks: 430 }],
            byDeviceType: [{ deviceType: 'desktop', clicks: 800 }],
            byCountry: [{ countryCode: 'TW', clicks: 900 }],
        });

        const req = {
            user: { id: 1, role: 'admin' },
            originalUrl: '/admin/stats/links',
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await invokeLinksWithErrorHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 401 when user id is missing', async () => {
        const req = {
            user: { role: 'admin' },
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 403 when role is invalid', async () => {
        const req = {
            user: { id: 1, role: 'user' },
        } as never;
        const res = buildRes();

        await invokeWithErrorHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
    });
});
