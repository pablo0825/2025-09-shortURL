import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/admin/stats-admin-repository', () => ({
    getActiveUsersTwoFaStats: vi.fn(),
    getDailyActiveUsers: vi.fn(),
    getDailyLinkCreators: vi.fn(),
    getDailyNewUsers: vi.fn(),
    getWeeklyActiveUsers: vi.fn(),
    getWeeklyDeactivatedUsers: vi.fn(),
}));

import {
    getActiveUsersTwoFaStats,
    getDailyActiveUsers,
    getDailyLinkCreators,
    getDailyNewUsers,
    getWeeklyActiveUsers,
    getWeeklyDeactivatedUsers,
} from '../../src/repositories/admin/stats-admin-repository';
import { getAdminStatsUsersService } from '../../src/services/admin/admin-stats-service';

const mockedGetDailyActiveUsers = vi.mocked(getDailyActiveUsers);
const mockedGetDailyNewUsers = vi.mocked(getDailyNewUsers);
const mockedGetDailyLinkCreators = vi.mocked(getDailyLinkCreators);
const mockedGetWeeklyActiveUsers = vi.mocked(getWeeklyActiveUsers);
const mockedGetActiveUsersTwoFaStats = vi.mocked(getActiveUsersTwoFaStats);
const mockedGetWeeklyDeactivatedUsers = vi.mocked(getWeeklyDeactivatedUsers);

describe('admin-stats-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-10T08:00:00.000Z'));
    });

    it('should return 7 daily entries with summary data', async () => {
        mockedGetDailyActiveUsers.mockResolvedValue([
            { date: '2026-03-04', count: 38 },
            { date: '2026-03-05', count: 41 },
        ]);
        mockedGetDailyNewUsers.mockResolvedValue([
            { date: '2026-03-04', count: 3 },
            { date: '2026-03-05', count: 2 },
        ]);
        mockedGetDailyLinkCreators.mockResolvedValue([
            { date: '2026-03-04', count: 12 },
            { date: '2026-03-05', count: 15 },
        ]);
        mockedGetWeeklyActiveUsers.mockResolvedValue(180);
        mockedGetActiveUsersTwoFaStats.mockResolvedValue({
            active_users: 200,
            twofa_users: 124,
        });
        mockedGetWeeklyDeactivatedUsers.mockResolvedValue(2);

        const result = await getAdminStatsUsersService();

        expect(result.daily).toHaveLength(7);
        expect(result.daily[0]).toEqual({
            date: '2026-03-04',
            dau: 38,
            newUsers: 3,
            linkCreators: 12,
        });
        expect(result.summary).toEqual({
            wau: 180,
            twoFaRate: 0.62,
            deactivatedThisWeek: 2,
        });
    });

    it('should fill zero for days without activity', async () => {
        mockedGetDailyActiveUsers.mockResolvedValue([{ date: '2026-03-04', count: 10 }]);
        mockedGetDailyNewUsers.mockResolvedValue([]);
        mockedGetDailyLinkCreators.mockResolvedValue([]);
        mockedGetWeeklyActiveUsers.mockResolvedValue(10);
        mockedGetActiveUsersTwoFaStats.mockResolvedValue({
            active_users: 10,
            twofa_users: 5,
        });
        mockedGetWeeklyDeactivatedUsers.mockResolvedValue(0);

        const result = await getAdminStatsUsersService();

        expect(result.daily[1]).toEqual({
            date: '2026-03-05',
            dau: 0,
            newUsers: 0,
            linkCreators: 0,
        });
    });

    it('should return zero twoFaRate when there are no active users', async () => {
        mockedGetDailyActiveUsers.mockResolvedValue([]);
        mockedGetDailyNewUsers.mockResolvedValue([]);
        mockedGetDailyLinkCreators.mockResolvedValue([]);
        mockedGetWeeklyActiveUsers.mockResolvedValue(0);
        mockedGetActiveUsersTwoFaStats.mockResolvedValue({
            active_users: 0,
            twofa_users: 0,
        });
        mockedGetWeeklyDeactivatedUsers.mockResolvedValue(0);

        const result = await getAdminStatsUsersService();

        expect(result.summary.twoFaRate).toBe(0);
    });

    it('should wrap repository errors with service context', async () => {
        mockedGetDailyActiveUsers.mockRejectedValue(new Error('db down'));

        await expect(getAdminStatsUsersService()).rejects.toMatchObject({
            message: '[adminStatsService.getAdminStatsUsers] db down',
        });
    });
});
