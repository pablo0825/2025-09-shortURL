import { longUrlSchema } from '../schemas/long-url-schema';
import { isForbiddenTarget } from '../utils/is-forbidden-target';
import {
  createLinkRecord,
  deactivateLinkById,
  deleteLinkById,
  findLinkByShortCode,
  findLinkStateById,
  listLinks,
} from '../repositories/link-repository';
import {
  buildCacheKey,
  cacheDel,
  cacheExists,
  cacheGet,
  cacheSet,
} from '../lib/cache';

const SHORT_BASE_URL =
  process.env.SHORT_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3001';

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

interface ListLinksParams {
  page: number;
  pageSize: number;
  includeExpired: boolean;
  includeInactive: boolean;
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

const sanitizePage = (rawPage: number): number => {
  if (!Number.isFinite(rawPage) || rawPage <= 0) {
    return 1;
  }
  return Math.floor(rawPage);
};

const sanitizePageSize = (rawPageSize: number): number => {
  const clamped =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.floor(rawPageSize) : 30;
  return Math.min(Math.max(1, clamped), 200);
};

const ensureCode = (raw: string): string => {
  const code = raw.trim();
  if (!code) {
    throw new Error('short_code是必須的');
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
    throw new Error('short_code格式不正確');
  }
  return code;
};

export const createShortUrlService = async (
  longUrlInput: string,
  ip: string | null,
): Promise<CreateShortUrlResult> => {
  try {
    const parsed = LongUrlSchema.safeParse(longUrlInput);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? '無效的URL';
      throw new Error(msg);
    }

    const longUrl = parsed.data;
    const target = new URL(longUrl);
    const forbidden = await isForbiddenTarget(target.hostname);
    if (forbidden) {
      throw new Error('不允許的目標主機');
    }

    const created = await createLinkRecord(longUrl, ip);
    const shortUrl = new URL(`/${created.code}`, SHORT_BASE_URL).toString();
    return {
      id: created.id,
      code: created.code,
      shortUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[linkService.createShortUrl] ${msg}`);
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
      const parsed = LongUrlSchema.safeParse(cached);
      if (parsed.success) {
        const target = new URL(parsed.data);
        const forbidden = await isForbiddenTarget(target.hostname);
        if (!forbidden) {
          return {
            status: 'found',
            longUrl: parsed.data,
          };
        }
      }
      await cacheDel(key);
    }

    const row = await findLinkByShortCode(code);
    if (!row) {
      await cacheSet(tomb, '{"reason":"NOT_FOUND_OR_INACTIVE_OR_EXPIRED"}', 60);
      return { status: 'not_found' };
    }

    const parsed = LongUrlSchema.safeParse(row.long_url);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? '無效的URL');
    }

    const longUrl = parsed.data;
    const target = new URL(longUrl);
    const forbidden = await isForbiddenTarget(target.hostname);
    if (forbidden) {
      throw new Error('不允許的目標主機(資料庫)');
    }

    const expireAt = new Date(row.expire_at);
    const ttl = Math.max(1, Math.ceil((expireAt.getTime() - Date.now()) / 1000));
    await cacheSet(key, longUrl, ttl);

    return {
      status: 'found',
      id: row.id,
      longUrl,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[linkService.resolveShortCode] ${msg}`);
  }
};

export const getAllLinksService = async (
  params: ListLinksParams,
): Promise<ListLinksResult> => {
  try {
    const page = sanitizePage(params.page);
    const pageSize = sanitizePageSize(params.pageSize);
    const offset = (page - 1) * pageSize;

    const queried = await listLinks(
      pageSize,
      offset,
      params.includeExpired,
      params.includeInactive,
    );

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
      page,
      pageSize,
      total: queried.total,
      hasMore: page * pageSize < queried.total,
      data,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[linkService.getAllLinks] ${msg}`);
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
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[linkService.deleteLink] ${msg}`);
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
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[linkService.deactivateLink] ${msg}`);
  }
};
