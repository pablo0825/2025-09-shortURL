import { describe, expect, it } from 'vitest';

import { AppError, isAppError, toAppError } from '../../src/utils/app-error';

describe('app-error', () => {
    it('should create AppError with default name when code is omitted', () => {
        const err = new AppError(400, 'bad request');

        expect(err.name).toBe('AppError');
        expect(err.statusCode).toBe(400);
        expect(err.message).toBe('bad request');
    });

    it('should create AppError with code as name when code exists', () => {
        const err = new AppError(404, 'not found', 'UserNotFoundError');

        expect(err.name).toBe('UserNotFoundError');
        expect(err.code).toBe('UserNotFoundError');
    });

    it('should identify AppError instances', () => {
        expect(isAppError(new AppError(500, 'boom'))).toBe(true);
        expect(isAppError(new Error('boom'))).toBe(false);
    });

    it('should wrap existing AppError with context and keep status/code', () => {
        const baseError = new AppError(401, 'token invalid', 'AuthError');
        const wrapped = toAppError('authService.refresh', baseError);

        expect(wrapped.statusCode).toBe(401);
        expect(wrapped.code).toBe('AuthError');
        expect(wrapped.message).toBe('[authService.refresh] token invalid');
    });

    it('should wrap normal Error with fallback status', () => {
        const wrapped = toAppError('linkService.resolve', new Error('db down'), 503);

        expect(wrapped.statusCode).toBe(503);
        expect(wrapped.message).toBe('[linkService.resolve] db down');
    });

    it('should wrap unknown values with default status', () => {
        const wrapped = toAppError('linkService.resolve', 'bad value');

        expect(wrapped.statusCode).toBe(500);
        expect(wrapped.message).toBe('[linkService.resolve] bad value');
    });
});
