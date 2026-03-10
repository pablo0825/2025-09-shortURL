import { AppError } from '../../utils/app-error';
import {
    getActiveUsersTwoFaStats,
    getDailyActiveUsers,
    getDailyLinkCreators,
    getDailyNewUsers,
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
