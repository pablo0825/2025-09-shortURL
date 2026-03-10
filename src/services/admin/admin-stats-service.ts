import { AppError } from '../../utils/app-error';
import {
    getClicksByCountry,
    getClicksByDeviceType,
    getActiveUsersTwoFaStats,
    getDailyClicks,
    getDailyActiveUsers,
    getDailyLinkCreators,
    getDailyNewUsers,
    getLinkStatusSummary,
    getNewLinksCount,
    getTopReferers,
    getWeeklyActiveUsers,
    getWeeklyDeactivatedUsers,
} from '../../repositories/admin/stats-admin-repository';

interface DailyUserStatsItem {
    date: string;
    dau: number;
    newUsers: number;
    linkCreators: number;
}

interface AdminUsersStatsResult {
    daily: DailyUserStatsItem[];
    summary: {
        wau: number;
        twoFaRate: number;
        deactivatedThisWeek: number;
    };
}

interface DailyLinksStatsItem {
    date: string;
    clicks: number;
}

interface AdminLinksStatsResult {
    summary: {
        totalLinks: number;
        byStatus: {
            active: number;
            expired: number;
            disabled: number;
            deleted: number;
        };
        newLinksToday: number;
    };
    dailyClicks: DailyLinksStatsItem[];
    topReferers: Array<{
        domain: string;
        clicks: number;
    }>;
    byDeviceType: Array<{
        deviceType: 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';
        clicks: number;
    }>;
    byCountry: Array<{
        countryCode: string;
        clicks: number;
    }>;
}

const wrapServiceError = (context: string, error: unknown): AppError => {
    if (error instanceof AppError) {
        return new AppError(error.statusCode, `[${context}] ${error.message}`, error.code);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new AppError(500, `[${context}] ${message}`);
};

const getUtcWindow = (): { startAt: Date; endExclusive: Date } => {
    const now = new Date();
    const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const startAt = new Date(endExclusive);
    startAt.setUTCDate(startAt.getUTCDate() - 7);

    return {
        startAt,
        endExclusive,
    };
};

const buildDailyDates = (startAt: Date): string[] => {
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(startAt);
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
    });
};

const toCountMap = (rows: Array<{ date: string; count: number }>): Map<string, number> => {
    return rows.reduce((map, row) => {
        map.set(row.date, row.count);
        return map;
    }, new Map<string, number>());
};

const roundTwoFaRate = (twofaUsers: number, activeUsers: number): number => {
    if (activeUsers === 0) {
        return 0;
    }

    return Math.round((twofaUsers / activeUsers) * 100) / 100;
};

export const getAdminStatsUsersService = async (): Promise<AdminUsersStatsResult> => {
    try {
        const { startAt, endExclusive } = getUtcWindow();
        const startAtIso = startAt.toISOString();
        const endExclusiveIso = endExclusive.toISOString();

        const [dailyActiveUsers, dailyNewUsers, dailyLinkCreators, wau, twoFaStats, deactivatedThisWeek] =
            await Promise.all([
                getDailyActiveUsers(startAtIso, endExclusiveIso),
                getDailyNewUsers(startAtIso, endExclusiveIso),
                getDailyLinkCreators(startAtIso, endExclusiveIso),
                getWeeklyActiveUsers(startAtIso, endExclusiveIso),
                getActiveUsersTwoFaStats(),
                getWeeklyDeactivatedUsers(startAtIso, endExclusiveIso),
            ]);

        const dauMap = toCountMap(dailyActiveUsers);
        const newUsersMap = toCountMap(dailyNewUsers);
        const linkCreatorsMap = toCountMap(dailyLinkCreators);

        const daily = buildDailyDates(startAt).map((date) => ({
            date,
            dau: dauMap.get(date) ?? 0,
            newUsers: newUsersMap.get(date) ?? 0,
            linkCreators: linkCreatorsMap.get(date) ?? 0,
        }));

        return {
            daily,
            summary: {
                wau,
                twoFaRate: roundTwoFaRate(twoFaStats.twofa_users, twoFaStats.active_users),
                deactivatedThisWeek,
            },
        };
    } catch (error) {
        throw wrapServiceError('adminStatsService.getAdminStatsUsers', error);
    }
};

export const getAdminStatsLinksService = async (): Promise<AdminLinksStatsResult> => {
    try {
        const { startAt, endExclusive } = getUtcWindow();
        const startAtIso = startAt.toISOString();
        const endExclusiveIso = endExclusive.toISOString();
        const todayStartAtIso = new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const [linkStatusSummary, newLinksToday, dailyClicks, topReferers, byDeviceType, byCountry] =
            await Promise.all([
                getLinkStatusSummary(),
                getNewLinksCount(todayStartAtIso, endExclusiveIso),
                getDailyClicks(startAtIso, endExclusiveIso),
                getTopReferers(startAtIso, endExclusiveIso),
                getClicksByDeviceType(startAtIso, endExclusiveIso),
                getClicksByCountry(startAtIso, endExclusiveIso),
            ]);

        const dailyClicksMap = dailyClicks.reduce((map, row) => {
            map.set(row.date, row.clicks);
            return map;
        }, new Map<string, number>());

        return {
            summary: {
                totalLinks: linkStatusSummary.total_links,
                byStatus: {
                    active: linkStatusSummary.active_links,
                    expired: linkStatusSummary.expired_links,
                    disabled: linkStatusSummary.disabled_links,
                    deleted: linkStatusSummary.deleted_links,
                },
                newLinksToday,
            },
            dailyClicks: buildDailyDates(startAt).map((date) => ({
                date,
                clicks: dailyClicksMap.get(date) ?? 0,
            })),
            topReferers: topReferers.map((row) => ({
                domain: row.value,
                clicks: row.clicks,
            })),
            byDeviceType: byDeviceType.map((row) => ({
                deviceType: row.value,
                clicks: row.clicks,
            })),
            byCountry: byCountry.map((row) => ({
                countryCode: row.value,
                clicks: row.clicks,
            })),
        };
    } catch (error) {
        throw wrapServiceError('adminStatsService.getAdminStatsLinks', error);
    }
};
