import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/user-security-service', () => ({
    deleteMyAvatarService: vi.fn(),
    disable2faService: vi.fn(),
    enable2faService: vi.fn(),
    setup2faService: vi.fn(),
    softDeleteMyAccountService: vi.fn(),
    updateMyAvatarService: vi.fn(),
}));

vi.mock('../../src/services/user-password-service', () => ({
    changeMyPasswordService: vi.fn(),
}));

vi.mock('../../src/services/user-service', () => ({
    getMyProfileService: vi.fn(),
    updateMyProfileService: vi.fn(),
}));

vi.mock('../../src/services/user-session-service', () => ({
    getMySessionsListService: vi.fn(),
    logoutAllService: vi.fn(),
    logoutDeviceService: vi.fn(),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn().mockResolvedValue(undefined),
}));

import {
    changeMyPassword,
    disable2fa,
    enable2fa,
    getMyProfile,
    getMySessionsList,
    logoutAll,
    logoutDevice,
    setup2fa,
    softDeleteMyAccount,
    updateMyAvatar,
    updateMyProfile,
} from '../../src/controllers/user-controllers';
import { changeMyPasswordService } from '../../src/services/user-password-service';
import { getMyProfileService, updateMyProfileService } from '../../src/services/user-service';
import {
    getMySessionsListService,
    logoutAllService,
    logoutDeviceService,
} from '../../src/services/user-session-service';
import {
    disable2faService,
    enable2faService,
    setup2faService,
    softDeleteMyAccountService,
    updateMyAvatarService,
} from '../../src/services/user-security-service';
import { handleAccessTokenBlackList } from '../../src/utils/handle-access-token-black-list';

const mockedGetMyProfileService = vi.mocked(getMyProfileService);
const mockedUpdateMyProfileService = vi.mocked(updateMyProfileService);
const mockedUpdateMyAvatarService = vi.mocked(updateMyAvatarService);
const mockedChangeMyPasswordService = vi.mocked(changeMyPasswordService);
const mockedSetup2faService = vi.mocked(setup2faService);
const mockedEnable2faService = vi.mocked(enable2faService);
const mockedDisable2faService = vi.mocked(disable2faService);
const mockedSoftDeleteMyAccountService = vi.mocked(softDeleteMyAccountService);
const mockedGetMySessionsListService = vi.mocked(getMySessionsListService);
const mockedLogoutAllService = vi.mocked(logoutAllService);
const mockedLogoutDeviceService = vi.mocked(logoutDeviceService);
const mockedHandleAccessTokenBlackList = vi.mocked(handleAccessTokenBlackList);

const buildRes = () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const clearCookie = vi.fn().mockReturnThis();
    return { status, json, clearCookie };
};

describe('user-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 401 when getMyProfile user id is invalid', async () => {
        const req = { user: { id: undefined } } as never;
        const res = buildRes();

        await getMyProfile(req, res as never);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when getMyProfile service returns not found', async () => {
        mockedGetMyProfileService.mockRejectedValue(new Error('使用者資料不存在'));
        const req = { user: { id: 1 } } as never;
        const res = buildRes();

        await getMyProfile(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 400 when updateMyProfile body is invalid', async () => {
        const req = { user: { id: 1 }, body: { nickname: '' } } as never;
        const res = buildRes();

        await updateMyProfile(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 when updateMyProfile succeeds', async () => {
        mockedUpdateMyProfileService.mockResolvedValue({
            nickname: 'neo',
            unit: 'dev',
            phone: '123',
            job_title: 'eng',
        } as never);

        const req = {
            user: { id: 1 },
            body: { nickname: 'neo123', unit: 'dev', phone: '0912345678', jobTitle: 'eng' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await updateMyProfile(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when updateMyAvatar has no file', async () => {
        const req = { user: { id: 1 }, get: vi.fn() } as never;
        const res = buildRes();

        await updateMyAvatar(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should map UserNotFoundError to 404 in updateMyAvatar', async () => {
        const err = new Error('x');
        err.name = 'UserNotFoundError';
        mockedUpdateMyAvatarService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            file: { buffer: Buffer.from('x') },
            avatarFileType: { ext: 'png' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await updateMyAvatar(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should map PasswordMismatchError to 400 in changeMyPassword', async () => {
        const err = new Error('x');
        err.name = 'PasswordMismatchError';
        mockedChangeMyPasswordService.mockRejectedValue(err);

        const req = {
            user: { id: 1 },
            body: { currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await changeMyPassword(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should map TwofaCacheWriteError to 503 in setup2fa', async () => {
        const err = new Error('x');
        err.name = 'TwofaCacheWriteError';
        mockedSetup2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, email: 'a@example.com', name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await setup2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('should map TwofaQrGenerationError to 500 in setup2fa', async () => {
        const err = new Error('x');
        err.name = 'TwofaQrGenerationError';
        mockedSetup2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, email: 'a@example.com', name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await setup2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should map InvalidTwofaCodeError to 400 in enable2fa', async () => {
        const err = new Error('x');
        err.name = 'InvalidTwofaCodeError';
        mockedEnable2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should map PendingTwofaExpiredError to 400 in enable2fa', async () => {
        const err = new Error('x');
        err.name = 'PendingTwofaExpiredError';
        mockedEnable2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should map InvalidTwofaPayloadError to 400 in enable2fa', async () => {
        const err = new Error('x');
        err.name = 'InvalidTwofaPayloadError';
        mockedEnable2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should map TwofaCacheReadError to 503 in enable2fa', async () => {
        const err = new Error('x');
        err.name = 'TwofaCacheReadError';
        mockedEnable2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('should map UserNotFoundError to 404 in enable2fa', async () => {
        const err = new Error('x');
        err.name = 'UserNotFoundError';
        mockedEnable2faService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should clear cookie and return 200 when disable2fa succeeds', async () => {
        mockedDisable2faService.mockResolvedValue(undefined);

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await disable2fa(req, res as never);

        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 in disable2fa when service fails unexpectedly', async () => {
        mockedDisable2faService.mockRejectedValue(new Error('boom'));

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await disable2fa(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should map UserNotFoundError to 404 in softDeleteMyAccount', async () => {
        const err = new Error('x');
        err.name = 'UserNotFoundError';
        mockedSoftDeleteMyAccountService.mockRejectedValue(err);

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await softDeleteMyAccount(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 401 when getMySessionsList has no refresh token', async () => {
        const req = { user: { id: 1 }, cookies: {} } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never);

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 when getMySessionsList succeeds', async () => {
        mockedGetMySessionsListService.mockResolvedValue({ message: 'ok', data: [] });

        const req = { user: { id: 1 }, cookies: { refreshToken: 'r1' } } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when getMySessionsList service throws', async () => {
        mockedGetMySessionsListService.mockRejectedValue(new Error('db error'));
        const req = { user: { id: 1 }, cookies: { refreshToken: 'r1' } } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 200 when logoutAll succeeds', async () => {
        mockedLogoutAllService.mockResolvedValue({ count: 2 });

        const req = { user: { id: 1 } } as never;
        const res = buildRes();

        await logoutAll(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
    });

    it('should return 500 when logoutAll service throws', async () => {
        mockedLogoutAllService.mockRejectedValue(new Error('db error'));
        const req = { user: { id: 1 } } as never;
        const res = buildRes();

        await logoutAll(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should return 404 when logoutDevice target is not revoked', async () => {
        mockedLogoutDeviceService.mockResolvedValue({ revoked: false, currentSessionLoggedOut: false });

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 and clear cookie when logoutDevice logs out current session', async () => {
        mockedLogoutDeviceService.mockResolvedValue({ revoked: true, currentSessionLoggedOut: true });

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockedHandleAccessTokenBlackList).toHaveBeenCalled();
    });

    it('should return 500 when logoutDevice service throws', async () => {
        mockedLogoutDeviceService.mockRejectedValue(new Error('db error'));

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never);

        expect(res.status).toHaveBeenCalledWith(500);
    });
});
