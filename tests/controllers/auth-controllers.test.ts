import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/auth/auth-service', () => ({
    forgotPasswordService: vi.fn(),
    login2faService: vi.fn(),
    loginService: vi.fn(),
    logoutService: vi.fn(),
    refreshService: vi.fn(),
    registerService: vi.fn(),
    resetPasswordService: vi.fn(),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn().mockResolvedValue(undefined),
}));

import { AppError } from '../../src/utils/app-error';
import {
    forgotPassword,
    login,
    login2fa,
    logout,
    refresh,
    register,
    resetPassword,
} from '../../src/controllers/auth-controllers';
import {
    forgotPasswordService,
    login2faService,
    loginService,
    logoutService,
    refreshService,
    registerService,
    resetPasswordService,
} from '../../src/services/auth/auth-service';
import { handleAccessTokenBlackList } from '../../src/utils/handle-access-token-black-list';

const mockedRegisterService = vi.mocked(registerService);
const mockedLoginService = vi.mocked(loginService);
const mockedLogin2faService = vi.mocked(login2faService);
const mockedRefreshService = vi.mocked(refreshService);
const mockedLogoutService = vi.mocked(logoutService);
const mockedForgotPasswordService = vi.mocked(forgotPasswordService);
const mockedResetPasswordService = vi.mocked(resetPasswordService);
const mockedHandleAccessTokenBlackList = vi.mocked(handleAccessTokenBlackList);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const cookie = vi.fn().mockReturnThis();
    const clearCookie = vi.fn().mockReturnThis();
    return { status, json, cookie, clearCookie };
};

const buildNext = () => vi.fn();

describe('auth-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 409 when register service throws AppError', async () => {
        mockedRegisterService.mockRejectedValue(new AppError(409, '[authService.register] duplicated'));

        const req = {
            body: { email: 'a@example.com', nickname: 'tester1', password: 'Password1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await register(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when register body is invalid', async () => {
        const req = {
            body: { email: 'bad-email', nickname: 'x', password: 'short' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await register(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockedRegisterService).not.toHaveBeenCalled();
    });

    it('should return 201 when register succeeds', async () => {
        mockedRegisterService.mockResolvedValue({
            id: 1,
            email: 'a@example.com',
            nickname: 'tester1',
        } as never);

        const req = {
            body: { email: 'a@example.com', nickname: 'tester1', password: 'Password1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await register(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('should return 200 with 2fa payload when login requires 2fa', async () => {
        mockedLoginService.mockResolvedValue({
            type: 'requires_2fa',
            token: 'token-123',
            expiresInSec: 180,
        });

        const req = {
            body: { email: 'a@example.com', password: 'Password1' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.cookie).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            requires2FA: true,
            twofaToken: 'token-123',
            expiresInSec: 180,
        });
    });

    it('should set cookie and return 200 when login succeeds', async () => {
        mockedLoginService.mockResolvedValue({
            type: 'login_success',
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            maxAge: 1000,
            user: {
                id: 1,
                email: 'a@example.com',
                name: 'neo',
                role: 'user',
            },
        });

        const req = {
            body: { email: 'a@example.com', password: 'Password1' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login(req, res as never, next);

        expect(res.cookie).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when login body is invalid', async () => {
        const req = {
            body: { email: 'bad-email', password: 'short' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockedLoginService).not.toHaveBeenCalled();
    });

    it('should return 500 when login service throws non-AppError', async () => {
        mockedLoginService.mockRejectedValue(new Error('[authService.login] boom'));

        const req = {
            body: { email: 'a@example.com', password: 'Password1' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when login2fa body is invalid', async () => {
        const req = {
            body: { method: 'totp', code: 'bad' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login2fa(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should set cookie and return 200 when login2fa succeeds', async () => {
        mockedLogin2faService.mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            maxAge: 1000,
            user: {
                id: 1,
                email: 'a@example.com',
                name: 'neo',
                role: 'user',
            },
        } as never);

        const req = {
            body: {
                twofaToken: 'aaa.bbb.ccc',
                method: 'totp',
                code: '123456',
            },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login2fa(req, res as never, next);

        expect(res.cookie).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return AppError status when login2fa service fails', async () => {
        mockedLogin2faService.mockRejectedValue(
            new AppError(401, '[authService.login2fa] invalid code'),
        );

        const req = {
            body: {
                twofaToken: 'aaa.bbb.ccc',
                method: 'totp',
                code: '123456',
            },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await login2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should clear cookie when refresh service throws 401 AppError', async () => {
        mockedRefreshService.mockRejectedValue(
            new AppError(401, '[authService.refresh] token invalid'),
        );

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await refresh(req, res as never, next);

        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('should return 401 when refresh token is missing', async () => {
        const req = {
            cookies: {},
        } as never;
        const res = buildRes();
        const next = buildNext();

        await refresh(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockedRefreshService).not.toHaveBeenCalled();
    });

    it('should set cookie and return 200 when refresh succeeds', async () => {
        mockedRefreshService.mockResolvedValue({
            accessToken: 'access-token',
            refreshToken: 'refresh-token-next',
            maxAge: 1000,
            user: { id: 1, name: 'neo', role: 'user' },
        } as never);

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await refresh(req, res as never, next);

        expect(res.cookie).toHaveBeenCalledOnce();
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 and keep cookie when refresh service throws non-AppError', async () => {
        mockedRefreshService.mockRejectedValue(new Error('[authService.refresh] boom'));

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await refresh(req, res as never, next);

        expect(res.clearCookie).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should clear cookie and return 401 when logout service throws 401 AppError', async () => {
        mockedLogoutService.mockRejectedValue(new AppError(401, '[authService.logout] expired'));

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            headers: { authorization: 'Bearer token' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await logout(req, res as never, next);

        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockedHandleAccessTokenBlackList).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('should clear cookie and return 200 when logout succeeds', async () => {
        mockedLogoutService.mockResolvedValue({ success: true });

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            headers: { authorization: 'Bearer token' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await logout(req, res as never, next);

        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockedHandleAccessTokenBlackList).toHaveBeenCalledWith('Bearer token');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 401 when logout refresh token is missing', async () => {
        const req = {
            cookies: {},
        } as never;
        const res = buildRes();
        const next = buildNext();

        await logout(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockedLogoutService).not.toHaveBeenCalled();
    });

    it('should return 500 when logout service throws non-AppError', async () => {
        mockedLogoutService.mockRejectedValue(new Error('[authService.logout] boom'));

        const req = {
            cookies: { refreshToken: 'refresh-token' },
            headers: { authorization: 'Bearer token' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await logout(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 200 when forgotPassword succeeds', async () => {
        mockedForgotPasswordService.mockResolvedValue({ message: 'email sent' });

        const req = {
            body: { email: 'a@example.com' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await forgotPassword(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            message: 'email sent',
        });
    });

    it('should return AppError status when forgotPassword service fails', async () => {
        mockedForgotPasswordService.mockRejectedValue(
            new AppError(429, '[authService.forgotPassword] too many requests'),
        );

        const req = {
            body: { email: 'a@example.com' },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await forgotPassword(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 when forgotPassword email is invalid', async () => {
        const req = {
            body: { email: 'bad-email' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await forgotPassword(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockedForgotPasswordService).not.toHaveBeenCalled();
    });

    it('should return 400 when resetPassword body is invalid', async () => {
        const req = {
            body: { resetToken: 'bad', newPassword: 'short' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await resetPassword(req, res as never, next);

        expect(mockedResetPasswordService).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 when resetPassword succeeds', async () => {
        mockedResetPasswordService.mockResolvedValue({ message: 'reset ok' });

        const req = {
            body: {
                resetToken: 'a'.repeat(64),
                newPassword: 'Password1',
            },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await resetPassword(req, res as never, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            ok: true,
            message: 'reset ok',
        });
    });

    it('should return AppError status when resetPassword service fails', async () => {
        mockedResetPasswordService.mockRejectedValue(
            new AppError(400, '[authService.resetPassword] invalid reset link'),
        );

        const req = {
            body: {
                resetToken: 'a'.repeat(64),
                newPassword: 'Password1',
            },
            get: vi.fn().mockReturnValue('ua'),
            ip: '1.1.1.1',
        } as never;
        const res = buildRes();
        const next = buildNext();

        await resetPassword(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(AppError));
        expect(res.status).not.toHaveBeenCalled();
    });
});
