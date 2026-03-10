import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/repositories/admin/stats-admin-repository', () => ({
    getActiveUsersTwoFaStats: vi.fn(),
    getClicksByCountry: vi.fn(),
    getClicksByDeviceType: vi.fn(),
    getDailyActiveUsers: vi.fn(),
    getDailyClicks: vi.fn(),
    getDailyLinkCreators: vi.fn(),
    getDailyNewUsers: vi.fn(),
    getLinkStatusSummary: vi.fn(),
    getNewLinksCount: vi.fn(),
    getTopReferers: vi.fn(),
    getWeeklyActiveUsers: vi.fn(),
    getWeeklyDeactivatedUsers: vi.fn(),
}));

import {
    getClicksByCountry,
    getClicksByDeviceType,
    getDailyClicks,
    getLinkStatusSummary,
    getNewLinksCount,
    getTopReferers,
} from '../../src/repositories/admin/stats-admin-repository';
import { getAdminStatsLinksService } from '../../src/services/admin/admin-stats-service';

const mockedGetClicksByCountry = vi.mocked(getClicksByCountry);
const mockedGetClicksByDeviceType = vi.mocked(getClicksByDeviceType);
const mockedGetDailyClicks = vi.mocked(getDailyClicks);
const mockedGetLinkStatusSummary = vi.mocked(getLinkStatusSummary);
const mockedGetNewLinksCount = vi.mocked(getNewLinksCount);
const mockedGetTopReferers = vi.mocked(getTopReferers);

describe('admin-stats-service getAdminStatsLinksService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-10T08:00:00.000Z'));

        mockedGetLinkStatusSummary.mockResolvedValue({
            total_links: 320,
            active_links: 210,
            expired_links: 60,
            disabled_links: 30,
            deleted_links: 20,
        });
        mockedGetNewLinksCount.mockResolvedValue(8);
        mockedGetDailyClicks.mockResolvedValue([]);
        mockedGetTopReferers.mockResolvedValue([]);
        mockedGetClicksByDeviceType.mockResolvedValue([]);
        mockedGetClicksByCountry.mockResolvedValue([]);
    });

    it('should return link stats with full response shape', async () => {
        mockedGetDailyClicks.mockResolvedValue([
            { date: '2026-03-04', clicks: 1200 },
            { date: '2026-03-05', clicks: 980 },
        ]);
        mockedGetTopReferers.mockResolvedValue([
            { value: 'google.com', clicks: 430 },
            { value: 'twitter.com', clicks: 210 },
        ]);
        mockedGetClicksByDeviceType.mockResolvedValue([
            { value: 'desktop', clicks: 800 },
            { value: 'mobile', clicks: 600 },
        ]);
        mockedGetClicksByCountry.mockResolvedValue([
            { value: 'TW', clicks: 900 },
            { value: 'US', clicks: 300 },
        ]);

        const result = await getAdminStatsLinksService();

        expect(result.summary).toEqual({
            totalLinks: 320,
            byStatus: {
                active: 210,
                expired: 60,
                disabled: 30,
                deleted: 20,
            },
            newLinksToday: 8,
        });
        expect(result.dailyClicks).toHaveLength(7);
        expect(result.dailyClicks[0]).toEqual({ date: '2026-03-04', clicks: 1200 });
        expect(result.topReferers).toEqual([
            { domain: 'google.com', clicks: 430 },
            { domain: 'twitter.com', clicks: 210 },
        ]);
        expect(result.byDeviceType).toEqual([
            { deviceType: 'desktop', clicks: 800 },
            { deviceType: 'mobile', clicks: 600 },
        ]);
        expect(result.byCountry).toEqual([
            { countryCode: 'TW', clicks: 900 },
            { countryCode: 'US', clicks: 300 },
        ]);
    });

    it('should fill missing daily clicks with zero', async () => {
        mockedGetDailyClicks.mockResolvedValue([{ date: '2026-03-05', clicks: 980 }]);

        const result = await getAdminStatsLinksService();

        expect(result.dailyClicks).toEqual([
            { date: '2026-03-04', clicks: 0 },
            { date: '2026-03-05', clicks: 980 },
            { date: '2026-03-06', clicks: 0 },
            { date: '2026-03-07', clicks: 0 },
            { date: '2026-03-08', clicks: 0 },
            { date: '2026-03-09', clicks: 0 },
            { date: '2026-03-10', clicks: 0 },
        ]);
    });

    it('should return empty arrays when there are no clicks in the last 7 days', async () => {
        const result = await getAdminStatsLinksService();

        expect(result.topReferers).toEqual([]);
        expect(result.byDeviceType).toEqual([]);
        expect(result.byCountry).toEqual([]);
    });

    it('should wrap repository errors with service context', async () => {
        mockedGetLinkStatusSummary.mockRejectedValue(new Error('db failed'));

        await expect(getAdminStatsLinksService()).rejects.toMatchObject({
            statusCode: 500,
            message: '[adminStatsService.getAdminStatsLinks] db failed',
        });
    });
});
