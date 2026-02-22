import type { Request, Response } from 'express';
import { writeLogToDB } from '../utils/write-log-to-db';
import {
  createShortUrlService,
  deactivateLinkService,
  deleteLinkService,
  getAllLinksService,
  resolveShortCodeService,
} from '../services/link-service';

const cleanId = (rawId: string): string | null => {
  const id = rawId.trim();
  if (!/^\d+$/.test(id)) {
    return null;
  }
  return id;
};

export const createShortUrl = async (req: Request, res: Response) => {
  try {
    const result = await createShortUrlService(req.body?.longUrl, req.ip ?? null);
    writeLogToDB(req, result.id, `新增link ${result.shortUrl}`);

    return res.status(201).json({
      ok: true,
      code: result.code,
      shortUrl: result.shortUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('無效的URL') || msg.includes('不允許的目標主機')) {
      return res.status(400).json({
        ok: false,
        error: msg,
      });
    }

    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
};

export const redirectToLongUrl = async (req: Request, res: Response) => {
  try {
    const result = await resolveShortCodeService(req.params.code ?? '');
    if (result.status === 'not_found' || !result.longUrl) {
      return res.status(404).json({
        ok: false,
        error: 'shortURL 不存在',
      });
    }

    if (result.id) {
      writeLogToDB(req, result.id, 'link被使用');
    }
    return res.redirect(302, result.longUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('short_code是必須的') ||
      msg.includes('short_code格式不正確') ||
      msg.includes('不允許的目標主機')
    ) {
      return res.status(400).json({
        ok: false,
        error: msg,
      });
    }

    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
};

export const getAllLinks = async (req: Request, res: Response) => {
  try {
    const result = await getAllLinksService({
      page: Number(req.query.page ?? 1),
      pageSize: Number(req.query.pageSize ?? 30),
      includeExpired: req.query.includeExpired === 'true',
      includeInactive: req.query.includeInactive === 'true',
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
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
};

export const deleteLink = async (req: Request, res: Response) => {
  const id = cleanId(req.params.id ?? '');
  if (!id) {
    return res.status(400).json({
      ok: false,
      error: 'id 必須是正整數',
    });
  }

  try {
    const deleted = await deleteLinkService(id);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        err: `${id} 不存在`,
      });
    }

    writeLogToDB(req, id, `已刪除 ${id}`);
    return res.status(200).json({
      ok: true,
      message: `已刪除 ${id}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
};

export const deactivateLink = async (req: Request, res: Response) => {
  const id = cleanId(req.params.id ?? '');
  if (!id) {
    return res.status(400).json({
      ok: false,
      err: 'id 必須是正整數',
    });
  }

  try {
    const result = await deactivateLinkService(id);
    if (result.status === 'deactivated') {
      writeLogToDB(req, id, `${id} link停用`);
      return res.status(200).json({
        ok: true,
        msg: `${id} 已停用`,
      });
    }

    if (result.status === 'not_found') {
      return res.status(404).json({
        ok: false,
        err: `${id} 不存在`,
      });
    }

    if (result.status === 'already_inactive') {
      return res.status(409).json({
        ok: false,
        err: `id=${id} 已是停用狀態`,
      });
    }

    if (result.status === 'expired') {
      return res.status(410).json({
        ok: false,
        err: `id=${id} 已過期`,
      });
    }

    return res.status(409).json({
      ok: false,
      message: `${id} 無法停用(未知錯誤)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      ok: false,
      error: msg,
    });
  }
};
