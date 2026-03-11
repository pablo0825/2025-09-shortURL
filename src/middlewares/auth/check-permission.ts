// checkPermission.ts
import { type NextFunction } from 'express';
import type express from 'express';
import { buildCacheKey, cacheIsMember } from '../../lib/cache';

export function checkPermission(module: string, type: string) {
    return async (req: express.Request, res: express.Response, next: NextFunction) => {
        try {
            const userRole = req.user?.role;

            if (!userRole) {
                return res.status(401).json({
                    ok: false,
                    error: '未登入',
                });
            }

            // 檢查 Redis 中是否有此權限
            const redisKey = buildCacheKey('role', `${userRole}:permissions`);
            const permission = `${module}:${type}`;
            const hasPermission = await cacheIsMember(redisKey, permission);

            if (!hasPermission) {
                return res.status(403).json({
                    ok: false,
                    error: '權限不足',
                    required: permission,
                });
            }

            next();
        } catch (err) {
            return next(err);
        }
    };
}
