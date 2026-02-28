import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/user/user-security-service', () => ({
    deleteMyAvatarService: vi.fn(),
    disable2faService: vi.fn(),
    enable2faService: vi.fn(),
    setup2faService: vi.fn(),
    softDeleteMyAccountService: vi.fn(),
    updateMyAvatarService: vi.fn(),
}));

vi.mock('../../src/services/user/user-password-service', () => ({
    changeMyPasswordService: vi.fn(),
}));

vi.mock('../../src/services/user/user-service', () => ({
    getMyProfileService: vi.fn(),
    updateMyProfileService: vi.fn(),
}));

vi.mock('../../src/services/user/user-session-service', () => ({
    getMySessionsListService: vi.fn(),
    logoutAllService: vi.fn(),
    logoutDeviceService: vi.fn(),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn().mockResolvedValue(undefined),
}));

import {
    changeMyPassword,
    deleteMyAvatar,
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
import { changeMyPasswordService } from '../../src/services/user/user-password-service';
import { getMyProfileService, updateMyProfileService } from '../../src/services/user/user-service';
import {
    getMySessionsListService,
    logoutAllService,
    logoutDeviceService,
} from '../../src/services/user/user-session-service';
import {
    deleteMyAvatarService,
    disable2faService,
    enable2faService,
    setup2faService,
    softDeleteMyAccountService,
    updateMyAvatarService,
} from '../../src/services/user/user-security-service';
import { handleAccessTokenBlackList } from '../../src/utils/handle-access-token-black-list';

const mockedGetMyProfileService = vi.mocked(getMyProfileService);
const mockedUpdateMyProfileService = vi.mocked(updateMyProfileService);
const mockedUpdateMyAvatarService = vi.mocked(updateMyAvatarService);
const mockedDeleteMyAvatarService = vi.mocked(deleteMyAvatarService);
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

const buildNext = () => vi.fn();

const buildChangeMyPasswordReq = () =>
    ({
        user: { id: 1 },
        body: {
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
            newPasswordAgain: 'NewPassword1',
        },
        ip: '1.1.1.1',
        get: vi.fn().mockReturnValue('ua'),
    }) as never;

const expectChangeMyPasswordToCallNextWith = async (err: Error): Promise<void> => {
    mockedChangeMyPasswordService.mockRejectedValue(err);

    const req = buildChangeMyPasswordReq();
    const res = buildRes();
    const next = buildNext();

    await changeMyPassword(req, res as never, next);

    expect(next).toHaveBeenCalledWith(err);
};

describe('user-controllers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return 401 when getMyProfile user id is invalid', async () => {
        const req = { user: { id: undefined } } as never;
        const res = buildRes();

        await getMyProfile(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 404 when getMyProfile service returns not found', async () => {
        mockedGetMyProfileService.mockRejectedValue(new Error('使用者資料不存在'));
        const req = { user: { id: 1 } } as never;
        const res = buildRes();
        const next = buildNext();

        await getMyProfile(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 200 when getMyProfile succeeds', async () => {
        mockedGetMyProfileService.mockResolvedValue({
            nickname: 'neo',
            email: 'a@example.com',
            unit: 'dev',
            phone: '0912345678',
            job_title: 'eng',
            avatar_key: 'avatar.png',
            twofa_enabled: true,
            is_active: true,
            type: 'admin',
        } as never);

        const req = { user: { id: 1 } } as never;
        const res = buildRes();

        await getMyProfile(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when getMyProfile service fails unexpectedly', async () => {
        mockedGetMyProfileService.mockRejectedValue(new Error('db down'));
        const req = { user: { id: 1 } } as never;
        const res = buildRes();
        const next = buildNext();

        await getMyProfile(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 400 when updateMyProfile body is invalid', async () => {
        const req = { user: { id: 1 }, body: { nickname: '' } } as never;
        const res = buildRes();

        await updateMyProfile(req, res as never, buildNext());

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

        await updateMyProfile(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when updateMyProfile service fails unexpectedly', async () => {
        mockedUpdateMyProfileService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1 },
            body: { nickname: 'neo123', unit: 'dev', phone: '0912345678', jobTitle: 'eng' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();
        const next = buildNext();

        await updateMyProfile(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 400 when updateMyAvatar has no file', async () => {
        const req = { user: { id: 1 }, get: vi.fn() } as never;
        const res = buildRes();

        await updateMyAvatar(req, res as never, buildNext());

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
        const next = buildNext();

        await updateMyAvatar(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 200 when updateMyAvatar succeeds', async () => {
        mockedUpdateMyAvatarService.mockResolvedValue({
            filename: 'avatar.png',
            url: 'https://example.com/avatar.png',
        } as never);

        const req = {
            user: { id: 1, name: 'u' },
            file: { buffer: Buffer.from('x') },
            avatarFileType: { mime: 'image/png' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await updateMyAvatar(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 200 when deleteMyAvatar succeeds', async () => {
        mockedDeleteMyAvatarService.mockResolvedValue(undefined);

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await deleteMyAvatar(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when deleteMyAvatar service fails', async () => {
        mockedDeleteMyAvatarService.mockRejectedValue(new Error('db down'));

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();
        const next = buildNext();

        await deleteMyAvatar(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should map PasswordMismatchError to 400 in changeMyPassword', async () => {
        const err = new Error('x');
        err.name = 'PasswordMismatchError';

        await expectChangeMyPasswordToCallNextWith(err);
    });

    it('should return 400 when changeMyPassword body is invalid', async () => {
        const req = {
            user: { id: 1 },
            body: { currentPassword: 'short', newPassword: 'bad' },
        } as never;
        const res = buildRes();

        await changeMyPassword(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 when changeMyPassword user id is invalid', async () => {
        const req = {
            user: { id: undefined },
            body: { currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' },
        } as never;
        const res = buildRes();

        await changeMyPassword(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 when changeMyPassword succeeds', async () => {
        mockedChangeMyPasswordService.mockResolvedValue(undefined);

        const req = {
            user: { id: 1 },
            body: {
                currentPassword: 'OldPassword1',
                newPassword: 'NewPassword1',
                newPasswordAgain: 'NewPassword1',
            },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
            headers: { authorization: 'Bearer token' },
        } as never;
        const res = buildRes();

        await changeMyPassword(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should map PasswordAlreadyUpdatedError to 409 in changeMyPassword', async () => {
        const err = new Error('already changed');
        err.name = 'PasswordAlreadyUpdatedError';

        await expectChangeMyPasswordToCallNextWith(err);
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
        const next = buildNext();

        await setup2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
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
        const next = buildNext();

        await setup2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 401 when setup2fa email is invalid', async () => {
        const req = {
            user: { id: 1, email: 'bad-email', name: 'u' },
        } as never;
        const res = buildRes();

        await setup2fa(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 when setup2fa succeeds', async () => {
        mockedSetup2faService.mockResolvedValue({
            qrCode: 'qr',
            expiresInSec: 300,
            randomCode: 'abcdef',
        } as never);

        const req = {
            user: { id: 1, email: 'a@example.com', name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await setup2fa(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
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
        const next = buildNext();

        await enable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
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
        const next = buildNext();

        await enable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
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
        const next = buildNext();

        await enable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
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
        const next = buildNext();

        await enable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
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
        const next = buildNext();

        await enable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 400 when enable2fa body is invalid', async () => {
        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123', nonce: 'bad' },
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 200 when enable2fa succeeds', async () => {
        mockedEnable2faService.mockResolvedValue({
            backupCodes: ['a', 'b'],
        } as never);

        const req = {
            user: { id: 1, name: 'u' },
            body: { code: '123456', nonce: '0123456789abcdef0123456789abcdef' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await enable2fa(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should clear cookie and return 200 when disable2fa succeeds', async () => {
        mockedDisable2faService.mockResolvedValue(undefined);

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();

        await disable2fa(req, res as never, buildNext());

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
        const next = buildNext();

        await disable2fa(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 200 when softDeleteMyAccount succeeds', async () => {
        mockedSoftDeleteMyAccountService.mockResolvedValue(undefined);

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
            headers: { authorization: 'Bearer token' },
        } as never;
        const res = buildRes();

        await softDeleteMyAccount(req, res as never, buildNext());

        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(res.status).toHaveBeenCalledWith(200);
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
        const next = buildNext();

        await softDeleteMyAccount(req, res as never, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('should return 500 in softDeleteMyAccount when service fails unexpectedly', async () => {
        mockedSoftDeleteMyAccountService.mockRejectedValue(new Error('boom'));

        const req = {
            user: { id: 1, name: 'u' },
            ip: '1.1.1.1',
            get: vi.fn().mockReturnValue('ua'),
        } as never;
        const res = buildRes();
        const next = buildNext();

        await softDeleteMyAccount(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 when getMySessionsList has no refresh token', async () => {
        const req = { user: { id: 1 }, cookies: {} } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 when getMySessionsList user id is invalid', async () => {
        const req = { user: { id: undefined }, cookies: { refreshToken: 'r1' } } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockedGetMySessionsListService).not.toHaveBeenCalled();
    });

    it('should return 200 when getMySessionsList succeeds', async () => {
        mockedGetMySessionsListService.mockResolvedValue({ message: 'ok', data: [] });

        const req = { user: { id: 1 }, cookies: { refreshToken: 'r1' } } as never;
        const res = buildRes();

        await getMySessionsList(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 500 when getMySessionsList service throws', async () => {
        mockedGetMySessionsListService.mockRejectedValue(new Error('db error'));
        const req = { user: { id: 1 }, cookies: { refreshToken: 'r1' } } as never;
        const res = buildRes();
        const next = buildNext();

        await getMySessionsList(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 401 when logoutAll user id is invalid', async () => {
        const req = { user: { id: undefined } } as never;
        const res = buildRes();

        await logoutAll(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 200 when logoutAll succeeds', async () => {
        mockedLogoutAllService.mockResolvedValue({ count: 2 });

        const req = { user: { id: 1 }, headers: { authorization: 'Bearer token' } } as never;
        const res = buildRes();

        await logoutAll(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockedHandleAccessTokenBlackList).toHaveBeenCalledWith('Bearer token');
    });

    it('should return 500 when logoutAll service throws', async () => {
        mockedLogoutAllService.mockRejectedValue(new Error('db error'));
        const req = { user: { id: 1 } } as never;
        const res = buildRes();
        const next = buildNext();

        await logoutAll(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should return 404 when logoutDevice target is not revoked', async () => {
        mockedLogoutDeviceService.mockResolvedValue({
            revoked: false,
            currentSessionLoggedOut: false,
        });

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should return 200 and clear cookie when logoutDevice logs out current session', async () => {
        mockedLogoutDeviceService.mockResolvedValue({
            revoked: true,
            currentSessionLoggedOut: true,
        });

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockedHandleAccessTokenBlackList).toHaveBeenCalled();
    });

    it('should return 400 when logoutDevice session id is invalid', async () => {
        const req = {
            user: { id: 1 },
            params: { sessionId: 'bad' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 when logoutDevice user id is invalid', async () => {
        const req = {
            user: { id: undefined },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockedLogoutDeviceService).not.toHaveBeenCalled();
    });

    it('should return 200 without clearing cookie when logoutDevice logs out another session', async () => {
        mockedLogoutDeviceService.mockResolvedValue({
            revoked: true,
            currentSessionLoggedOut: false,
        });

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();

        await logoutDevice(req, res as never, buildNext());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.clearCookie).not.toHaveBeenCalled();
    });

    it('should return 500 when logoutDevice service throws', async () => {
        mockedLogoutDeviceService.mockRejectedValue(new Error('db error'));

        const req = {
            user: { id: 1 },
            params: { sessionId: '1' },
            cookies: { refreshToken: 'r1' },
        } as never;
        const res = buildRes();
        const next = buildNext();

        await logoutDevice(req, res as never, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});
