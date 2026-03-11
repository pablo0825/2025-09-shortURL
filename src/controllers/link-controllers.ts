import type { NextFunction, Request, Response } from 'express';
import { longUrlSchema } from '../schemas/long-url-schema';
import { recordLinkClickService } from '../services/link/link-log-service';
import { linkIdParamSchema, listLinksQuerySchema } from '../schemas/link-schema';
import {
    createShortUrlService,
    deactivateLinkService,
    deleteLinkService,
    getAllLinksService,
    resolveShortCodeService,
} from '../services/link/link-service';

const LongUrlSchema = longUrlSchema({
    shortDomain: process.env.SHORT_BASE_URL,
    allowHash: true,
    stripTrackingParams: true,
    maxLength: 2048,
});

const buildLinkClickPayload = (req: Request) => {
    return {
        ip: req.ip ?? null,
        ua: req.get?.('user-agent') ?? null,
        referer: req.get?.('referer') ?? null,
        clickedAt: new Date().toISOString(),
    };
};

export const createShortUrl = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = LongUrlSchema.safeParse(req.body?.longUrl);
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? '無效的URL';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    try {
        const result = await createShortUrlService(parsed.data, req.ip ?? null, req.user!.id);

        return res.status(201).json({
            ok: true,
            code: result.code,
            shortUrl: result.shortUrl,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const redirectToLongUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await resolveShortCodeService(req.params.code ?? '');
        if (result.status === 'not_found' || !result.longUrl) {
            return res.status(404).json({
                ok: false,
                error: 'shortURL 不存在',
            });
        }

        if (result.id) {
            void recordLinkClickService(result.id, buildLinkClickPayload(req));
        }
        return res.redirect(302, result.longUrl);
    } catch (err) {
        next(err);
        return;
    }
};

export const getAllLinks = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = listLinksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? '查詢參數格式錯誤';
        return res.status(400).json({
            ok: false,
            error: msg,
        });
    }

    const { page, pageSize, includeExpired, includeInactive } = parsed.data;

    try {
        const result = await getAllLinksService({
            page,
            pageSize,
            includeExpired,
            includeInactive,
            userId: req.user!.id,
        });

        return res.status(200).json({
            ok: true,
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            hasMore: result.hasMore,
            data: result.data,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const deleteLink = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = linkIdParamSchema.safeParse(req.params.id ?? '');
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: 'id 必須是正整數',
        });
    }

    const id = parsed.data;

    try {
        const deleted = await deleteLinkService(id);
        if (!deleted) {
            return res.status(404).json({
                ok: false,
                error: `${id} 不存在`,
            });
        }

        return res.status(200).json({
            ok: true,
            message: `已刪除 ${id}`,
        });
    } catch (err) {
        next(err);
        return;
    }
};

export const deactivateLink = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = linkIdParamSchema.safeParse(req.params.id ?? '');
    if (!parsed.success) {
        return res.status(400).json({
            ok: false,
            error: 'id 必須是正整數',
        });
    }

    const id = parsed.data;

    try {
        const result = await deactivateLinkService(id);
        if (result.status === 'deactivated') {
            return res.status(200).json({
                ok: true,
                message: `${id} 已停用`,
            });
        }

        if (result.status === 'not_found') {
            return res.status(404).json({
                ok: false,
                error: `${id} 不存在`,
            });
        }

        if (result.status === 'already_inactive') {
            return res.status(409).json({
                ok: false,
                error: `id=${id} 已是停用狀態`,
            });
        }

        if (result.status === 'expired') {
            return res.status(410).json({
                ok: false,
                error: `id=${id} 已過期`,
            });
        }

        return res.status(409).json({
            ok: false,
            error: `${id} 無法停用(未知錯誤)`,
        });
    } catch (err) {
        next(err);
        return;
    }
};
