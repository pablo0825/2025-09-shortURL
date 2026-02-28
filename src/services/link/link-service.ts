import { longUrlSchema } from '../../schemas/long-url-schema';
import { isForbiddenTarget } from '../../lib/is-forbidden-target';
import {
    createLinkRecord,
    deactivateLinkById,
    deleteLinkById,
    findLinkByShortCode,
    findLinkStateById,
    listLinks,
} from '../../repositories/link/link-repository';
import { buildCacheKey, cacheDel, cacheExists, cacheGet, cacheSet } from '../../lib/cache';
import { AppError, toAppError } from '../../utils/app-error';
import type { ListLinksQueryDto } from '../../schemas/link-schema';

const SHORT_BASE_URL = process.env.SHORT_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3001';

const LongUrlSchema = longUrlSchema({
    shortDomain: process.env.SHORT_BASE_URL,
    allowHash: true,
    stripTrackingParams: true,
    maxLength: 2048,
});

interface CreateShortUrlResult {
    id: string;
    code: string;
    shortUrl: string;
}

interface ResolveResult {
    status: 'found' | 'not_found';
    longUrl?: string;
    id?: string;
}

interface ListLinksItem {
    id: string;
    shortUrl: string;
    longUrl: string;
    createdAt: Date | string;
    expireAt: Date | string;
    isActive: boolean;
}

interface ListLinksResult {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
    data: ListLinksItem[];
}

interface DeactivateResult {
    status: 'deactivated' | 'not_found' | 'already_inactive' | 'expired';
}

type ResolvedLongUrlResult =
    | {
          ok: true;
          longUrl: string;
      }
    | {
          ok: false;
          invalidMessage?: string;
      };

const ensureCode = (raw: string): string => {
    const code = raw.trim();
    if (!code) {
        throw new AppError(400, 'short_code是必須的');
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
        throw new AppError(400, 'short_code格式不正確');
    }
    return code;
};

const resolveAllowedLongUrl = async (rawLongUrl: string): Promise<ResolvedLongUrlResult> => {
    const parsed = LongUrlSchema.safeParse(rawLongUrl);
    if (!parsed.success) {
        return {
            ok: false,
            invalidMessage: parsed.error.issues[0]?.message ?? '無效的URL',
        };
    }

    const longUrl = parsed.data;
    const target = new URL(longUrl);
    const forbidden = await isForbiddenTarget(target.hostname);
    if (forbidden) {
        return {
            ok: false,
        };
    }

    return {
        ok: true,
        longUrl,
    };
};

export const createShortUrlService = async (
    longUrl: string,
    ip: string | null,
): Promise<CreateShortUrlResult> => {
    try {
        const target = new URL(longUrl);
        const forbidden = await isForbiddenTarget(target.hostname);
        if (forbidden) {
            throw new AppError(400, '不允許的目標主機');
        }

        const created = await createLinkRecord(longUrl, ip);
        const shortUrl = new URL(`/${created.code}`, SHORT_BASE_URL).toString();
        return {
            id: created.id,
            code: created.code,
            shortUrl,
        };
    } catch (err) {
        throw toAppError('linkService.createShortUrl', err);
    }
};

export const resolveShortCodeService = async (rawCode: string): Promise<ResolveResult> => {
    try {
        const code = ensureCode(rawCode);
        const key = buildCacheKey('short', code);
        const tomb = buildCacheKey('short404', code);

        if (await cacheExists(tomb)) {
            return { status: 'not_found' };
        }

        const cached = await cacheGet(key);
        if (cached) {
            const resolvedCached = await resolveAllowedLongUrl(cached);
            if (resolvedCached.ok && resolvedCached.longUrl) {
                return {
                    status: 'found',
                    longUrl: resolvedCached.longUrl,
                };
            }
            await cacheDel(key);
        }

        const row = await findLinkByShortCode(code);
        if (!row) {
            await cacheSet(tomb, '{"reason":"NOT_FOUND_OR_INACTIVE_OR_EXPIRED"}', 60);
            return { status: 'not_found' };
        }

        const resolvedDbLongUrl = await resolveAllowedLongUrl(row.long_url);
        if (!resolvedDbLongUrl.ok) {
            if (resolvedDbLongUrl.invalidMessage) {
                throw new AppError(400, resolvedDbLongUrl.invalidMessage);
            }
            throw new AppError(400, '不允許的目標主機(資料庫)');
        }

        const longUrl = resolvedDbLongUrl.longUrl;

        const expireAt = new Date(row.expire_at);
        const ttl = Math.max(1, Math.ceil((expireAt.getTime() - Date.now()) / 1000));
        await cacheSet(key, longUrl, ttl);

        return {
            status: 'found',
            id: row.id,
            longUrl,
        };
    } catch (err) {
        throw toAppError('linkService.resolveShortCode', err);
    }
};

export const getAllLinksService = async (input: ListLinksQueryDto): Promise<ListLinksResult> => {
    try {
        const offset = (input.page - 1) * input.pageSize;

        const queried = await listLinks(input.pageSize, offset, input.includeExpired, input.includeInactive);

        const data: ListLinksItem[] = queried.rows.map((row) => {
            const shortUrl = new URL(`/${row.code}`, SHORT_BASE_URL).toString();
            return {
                id: row.id,
                shortUrl,
                longUrl: row.long_url,
                createdAt: row.created_at,
                expireAt: row.expire_at,
                isActive: row.is_active,
            };
        });

        return {
            page:input.page,
            pageSize: input.pageSize,
            total: queried.total,
            hasMore: input.page * input.pageSize < queried.total,
            data,
        };
    } catch (err) {
        throw toAppError('linkService.getAllLinks', err);
    }
};

export const deleteLinkService = async (id: string): Promise<boolean> => {
    try {
        const code = await deleteLinkById(id);
        if (!code) {
            return false;
        }
        await cacheDel(buildCacheKey('short', code));
        await cacheDel(buildCacheKey('short404', code));
        return true;
    } catch (err) {
        throw toAppError('linkService.deleteLink', err);
    }
};

export const deactivateLinkService = async (id: string): Promise<DeactivateResult> => {
    try {
        const code = await deactivateLinkById(id);
        if (code) {
            await cacheDel(buildCacheKey('short', code));
            await cacheDel(buildCacheKey('short404', code));
            return { status: 'deactivated' };
        }

        const state = await findLinkStateById(id);
        if (!state) {
            return { status: 'not_found' };
        }
        if (!state.is_active) {
            return { status: 'already_inactive' };
        }
        if (new Date(state.expire_at) <= new Date()) {
            return { status: 'expired' };
        }

        return { status: 'already_inactive' };
    } catch (err) {
        throw toAppError('linkService.deactivateLink', err);
    }
};
