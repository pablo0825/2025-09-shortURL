import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
    mockLogger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('../../src/lib/logger', () => ({
    logger: mockLogger,
}));

import { AppError } from '../../src/utils/app-error';
import { errorHandler, notFoundHandler } from '../../src/middlewares/error/error-handler';

const createResponse = (headersSent = false): Response => {
    const response = {
        headersSent,
        status: vi.fn(),
        json: vi.fn(),
    } as unknown as Response;

    (response.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);
    (response.json as unknown as ReturnType<typeof vi.fn>).mockReturnValue(response);

    return response;
};

describe('error-handler middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 404 in notFoundHandler', () => {
        const res = createResponse();

        notFoundHandler({} as Request, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Not Found',
        });
    });

    it('should delegate to next when headers already sent', () => {
        const err = new Error('boom');
        const req = {} as Request;
        const res = createResponse(true);
        const next = vi.fn() as NextFunction;

        errorHandler(err, req, res, next);

        expect(next).toHaveBeenCalledWith(err);
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return AppError status and cleaned message', () => {
        const err = new AppError(401, '[authService.refresh] token invalid');
        const req = {
            method: 'POST',
            originalUrl: '/api/auth/refresh',
            ip: '1.1.1.1',
        } as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        errorHandler(err, req, res, next);

        expect(mockLogger.error).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'token invalid',
        });
    });

    it('should return 500 for generic Error', () => {
        const err = new Error('[userService.profile] db down');
        const req = {
            method: 'GET',
            originalUrl: '/api/user/profile',
            ip: '1.1.1.1',
        } as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        errorHandler(err, req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'db down',
        });
    });

    it('should return default 500 message for non-Error values', () => {
        const req = {
            method: 'GET',
            originalUrl: '/api/test',
            ip: '1.1.1.1',
        } as Request;
        const res = createResponse();
        const next = vi.fn() as NextFunction;

        errorHandler('bad value', req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
            ok: false,
            error: 'Internal Server Error',
        });
    });
});
