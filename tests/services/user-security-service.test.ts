import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const { queryMock, releaseMock, writeFileMock, unlinkMock, mkdirMock, toBufferMock } = vi.hoisted(
    () => ({
        queryMock: vi.fn(),
        releaseMock: vi.fn(),
        writeFileMock: vi.fn(),
        unlinkMock: vi.fn(),
        mkdirMock: vi.fn(),
        toBufferMock: vi.fn(),
    }),
);

vi.mock('../../src/db/pool', () => ({
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('../../src/repositories/user/user-security-repository', () => ({
    clearUserAvatarKey: vi.fn(),
    disableTwofaAndRevokeSessions: vi.fn(),
    enableTwofaForUser: vi.fn(),
    findActiveUserAvatarForUpdate: vi.fn(),
    findTwofaVersionForUpdate: vi.fn(),
    insertBackupCodeHashes: vi.fn(),
    softDeleteUserAndRevokeSessions: vi.fn(),
    updateUserAvatarKey: vi.fn(),
}));

vi.mock('../../src/services/user/user-log-service', () => ({
    recordUserLogService: vi.fn(),
}));

vi.mock('../../src/utils/handle-access-token-black-list', () => ({
    handleAccessTokenBlackList: vi.fn(),
}));

vi.mock('../../src/utils/totp', () => ({
    generateTotpSecret: vi.fn(),
    buildOtpAuthUrl: vi.fn(),
    verifyTotpCode: vi.fn(),
}));

vi.mock('../../src/utils/qrcode', () => ({
    toDataUrl: vi.fn(),
}));

vi.mock('../../src/utils/crypto-utils', () => ({
    encrypt: vi.fn(),
    decrypt: vi.fn(),
}));

vi.mock('../../src/utils/backup-codes', () => ({
    generateBackupCodes: vi.fn(),
    hashBackupCodes: vi.fn(),
}));

vi.mock('../../src/lib/cache', () => ({
    buildCacheKey: vi.fn((module: string, identifier: string) => `${module}:${identifier}`),
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    cacheDel: vi.fn(),
}));

vi.mock('fs/promises', () => ({
    default: {
        mkdir: mkdirMock,
        writeFile: writeFileMock,
        unlink: unlinkMock,
    },
}));

vi.mock('sharp', () => ({
    default: vi.fn(() => ({
        rotate: () => ({
            resize: () => ({
                webp: () => ({
                    toBuffer: toBufferMock,
                }),
            }),
        }),
    })),
}));

const fakeClient = {
    query: queryMock,
    release: releaseMock,
};

import { pool } from '../../src/db/pool';
import {
    clearUserAvatarKey,
    disableTwofaAndRevokeSessions,
    enableTwofaForUser,
    findActiveUserAvatarForUpdate,
    findTwofaVersionForUpdate,
    insertBackupCodeHashes,
    softDeleteUserAndRevokeSessions,
    updateUserAvatarKey,
} from '../../src/repositories/user/user-security-repository';
import { recordUserLogService } from '../../src/services/user/user-log-service';
import { handleAccessTokenBlackList } from '../../src/utils/handle-access-token-black-list';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotpCode } from '../../src/utils/totp';
import { toDataUrl } from '../../src/utils/qrcode';
import { decrypt, encrypt } from '../../src/utils/crypto-utils';
import { generateBackupCodes, hashBackupCodes } from '../../src/utils/backup-codes';
import { cacheDel, cacheGet, cacheSet } from '../../src/lib/cache';
import {
    deleteMyAvatarService,
    disable2faService,
    enable2faService,
    setup2faService,
    softDeleteMyAccountService,
    updateMyAvatarService,
} from '../../src/services/user/user-security-service';

const mockedPool = vi.mocked(pool);
const mockedFindActiveUserAvatarForUpdate = vi.mocked(findActiveUserAvatarForUpdate);
const mockedUpdateUserAvatarKey = vi.mocked(updateUserAvatarKey);
const mockedClearUserAvatarKey = vi.mocked(clearUserAvatarKey);
const mockedFindTwofaVersionForUpdate = vi.mocked(findTwofaVersionForUpdate);
const mockedEnableTwofaForUser = vi.mocked(enableTwofaForUser);
const mockedInsertBackupCodeHashes = vi.mocked(insertBackupCodeHashes);
const mockedDisableTwofaAndRevokeSessions = vi.mocked(disableTwofaAndRevokeSessions);
const mockedSoftDeleteUserAndRevokeSessions = vi.mocked(softDeleteUserAndRevokeSessions);
const mockedWriteUserLogToDB = vi.mocked(recordUserLogService);
const mockedHandleAccessTokenBlackList = vi.mocked(handleAccessTokenBlackList);
const mockedGenerateTotpSecret = vi.mocked(generateTotpSecret);
const mockedBuildOtpAuthUrl = vi.mocked(buildOtpAuthUrl);
const mockedVerifyTotpCode = vi.mocked(verifyTotpCode);
const mockedToDataUrl = vi.mocked(toDataUrl);
const mockedEncrypt = vi.mocked(encrypt);
const mockedDecrypt = vi.mocked(decrypt);
const mockedGenerateBackupCodes = vi.mocked(generateBackupCodes);
const mockedHashBackupCodes = vi.mocked(hashBackupCodes);
const mockedCacheGet = vi.mocked(cacheGet);
const mockedCacheSet = vi.mocked(cacheSet);
const mockedCacheDel = vi.mocked(cacheDel);

describe('user-security-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
        mockedPool.connect.mockResolvedValue(fakeClient as never);
        queryMock.mockResolvedValue({ rowCount: 1 });
        toBufferMock.mockResolvedValue(Buffer.from('webp'));
        mkdirMock.mockResolvedValue(undefined);
        writeFileMock.mockResolvedValue(undefined);
        unlinkMock.mockResolvedValue(undefined);
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({ exists: true, avatarKey: null });
        mockedUpdateUserAvatarKey.mockResolvedValue(true);
        mockedClearUserAvatarKey.mockResolvedValue(true);
    });

    it('should setup 2fa successfully', async () => {
        mockedGenerateTotpSecret.mockReturnValue('secret');
        mockedBuildOtpAuthUrl.mockReturnValue('otpauth://x');
        mockedToDataUrl.mockResolvedValue('data:image/png;base64,abc');
        mockedEncrypt.mockReturnValue({
            encrypted: Buffer.from('enc'),
            iv: Buffer.from('iv'),
            authTag: Buffer.from('tag'),
        });

        const result = await setup2faService(
            { userId: 7, userName: 'u', ip: '1.1.1.1', userAgent: 'ua' },
            'a@example.com',
        );

        expect(result.qrCode).toContain('data:image');
        expect(result.expiresInSec).toBe(600);
        expect(result.randomCode.length).toBe(32);
        expect(mockedCacheSet).toHaveBeenCalledOnce();
        expect(mockedWriteUserLogToDB).toHaveBeenCalledOnce();
    });

    it('should remove old avatar file after successful avatar update', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: true,
            avatarKey: '/static/avatars/7/old.webp',
        });

        const result = await updateMyAvatarService(
            { userId: 7, userName: 'u', ip: '1.1.1.1', userAgent: 'ua' },
            { fileBuffer: Buffer.from('raw'), fileType: 'image/png' },
        );

        expect(result.filename).toBe('00000000-0000-4000-8000-000000000000.webp');
        expect(result.url).toBe('/static/avatars/7/00000000-0000-4000-8000-000000000000.webp');
        expect(unlinkMock).toHaveBeenCalledWith(
            expect.stringContaining('uploads/avatars/7/old.webp'),
        );
    });

    it('should throw rollback wrapped error when avatar rollback fails', async () => {
        mockedUpdateUserAvatarKey.mockRejectedValue(new Error('update failed'));
        queryMock.mockImplementation(async (sql: string) => {
            if (sql === 'ROLLBACK') {
                throw new Error('rollback failed');
            }

            return { rowCount: 1 };
        });

        await expect(
            updateMyAvatarService(
                { userId: 7, userName: 'u', ip: null, userAgent: null },
                { fileBuffer: Buffer.from('raw') },
            ),
        ).rejects.toThrow('[userSecurityService.updateMyAvatar.rollback] rollback failed');

        expect(releaseMock).toHaveBeenCalledOnce();
    });

    it('should throw UserNotFoundError when updating avatar for missing user', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: false,
            avatarKey: null,
        });

        await expect(
            updateMyAvatarService(
                { userId: 7, userName: 'u', ip: null, userAgent: null },
                { fileBuffer: Buffer.from('raw') },
            ),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
        expect(unlinkMock).toHaveBeenCalledWith(
            expect.stringContaining('uploads/avatars/7/00000000-0000-4000-8000-000000000000.webp'),
        );
    });

    it('should delete avatar successfully when avatar key exists', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: true,
            avatarKey: '/static/avatars/7/old.webp',
        });

        await deleteMyAvatarService({
            userId: 7,
            userName: 'u',
            ip: '1.1.1.1',
            userAgent: 'ua',
        });

        expect(mockedClearUserAvatarKey).toHaveBeenCalledOnce();
        expect(unlinkMock).toHaveBeenCalledWith(
            expect.stringContaining('uploads/avatars/7/old.webp'),
        );
        expect(mockedWriteUserLogToDB).toHaveBeenCalled();
        expect(queryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should skip clearing avatar when avatar key is already null', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: true,
            avatarKey: null,
        });

        await deleteMyAvatarService({
            userId: 7,
            userName: 'u',
            ip: '1.1.1.1',
            userAgent: 'ua',
        });

        expect(mockedClearUserAvatarKey).not.toHaveBeenCalled();
        expect(unlinkMock).not.toHaveBeenCalled();
        expect(mockedWriteUserLogToDB).toHaveBeenCalled();
    });

    it('should throw UserNotFoundError when deleting avatar for missing user', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: false,
            avatarKey: null,
        });

        await expect(
            deleteMyAvatarService({
                userId: 7,
                userName: 'u',
                ip: null,
                userAgent: null,
            }),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw UserNotFoundError when clearing avatar key fails', async () => {
        mockedFindActiveUserAvatarForUpdate.mockResolvedValue({
            exists: true,
            avatarKey: '/static/avatars/7/old.webp',
        });
        mockedClearUserAvatarKey.mockResolvedValue(false);

        await expect(
            deleteMyAvatarService({
                userId: 7,
                userName: 'u',
                ip: null,
                userAgent: null,
            }),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should throw TwofaQrGenerationError when qr code generation fails', async () => {
        mockedGenerateTotpSecret.mockReturnValue('secret');
        mockedBuildOtpAuthUrl.mockReturnValue('otpauth://x');
        mockedToDataUrl.mockRejectedValue(new Error('qrcode failed'));

        await expect(
            setup2faService(
                { userId: 7, userName: 'u', ip: null, userAgent: null },
                'a@example.com',
            ),
        ).rejects.toMatchObject({ name: 'TwofaQrGenerationError' });
    });

    it('should throw TwofaCacheWriteError when cache write fails', async () => {
        mockedGenerateTotpSecret.mockReturnValue('secret');
        mockedBuildOtpAuthUrl.mockReturnValue('otpauth://x');
        mockedToDataUrl.mockResolvedValue('data:image/png;base64,abc');
        mockedEncrypt.mockReturnValue({
            encrypted: Buffer.from('enc'),
            iv: Buffer.from('iv'),
            authTag: Buffer.from('tag'),
        });
        mockedCacheSet.mockRejectedValue(new Error('redis down'));

        await expect(
            setup2faService(
                { userId: 7, userName: 'u', ip: null, userAgent: null },
                'a@example.com',
            ),
        ).rejects.toMatchObject({ name: 'TwofaCacheWriteError' });
    });

    it('should throw PendingTwofaExpiredError when pending 2fa is missing', async () => {
        mockedCacheGet.mockResolvedValue(null);

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toMatchObject({ name: 'PendingTwofaExpiredError' });
    });

    it('should throw TwofaCacheReadError when cache read fails', async () => {
        mockedCacheGet.mockRejectedValue(new Error('redis read down'));

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toMatchObject({ name: 'TwofaCacheReadError' });
    });

    it('should throw InvalidTwofaPayloadError when pending 2fa payload is invalid json', async () => {
        mockedCacheGet.mockResolvedValue('this-is-not-json');

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toMatchObject({ name: 'InvalidTwofaPayloadError' });
    });

    it('should throw InvalidTwofaCodeError when totp code is invalid', async () => {
        mockedCacheGet.mockResolvedValue(
            JSON.stringify({
                encrypted: Buffer.from('enc').toString('base64'),
                iv: Buffer.from('iv').toString('base64'),
                authTag: Buffer.from('tag').toString('base64'),
            }),
        );
        mockedDecrypt.mockReturnValue('secret');
        mockedVerifyTotpCode.mockReturnValue(false);

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toMatchObject({ name: 'InvalidTwofaCodeError' });
    });

    it('should enable 2fa successfully', async () => {
        mockedCacheGet.mockResolvedValue(
            JSON.stringify({
                encrypted: Buffer.from('enc').toString('base64'),
                iv: Buffer.from('iv').toString('base64'),
                authTag: Buffer.from('tag').toString('base64'),
            }),
        );
        mockedDecrypt.mockReturnValue('secret');
        mockedVerifyTotpCode.mockReturnValue(true);
        mockedGenerateBackupCodes.mockReturnValue(['c1', 'c2']);
        mockedHashBackupCodes.mockResolvedValue(['h1', 'h2']);
        mockedFindTwofaVersionForUpdate.mockResolvedValue(3);

        const result = await enable2faService(
            { userId: 9, userName: 'u', ip: null, userAgent: null },
            { code: '123456', nonce: 'nonce' },
        );

        expect(result.backupCodes).toEqual(['c1', 'c2']);
        expect(mockedEnableTwofaForUser).toHaveBeenCalledOnce();
        expect(mockedInsertBackupCodeHashes).toHaveBeenCalledOnce();
        expect(mockedCacheDel).toHaveBeenCalledOnce();
    });

    it('should throw UserNotFoundError when enabling 2fa for missing user', async () => {
        mockedCacheGet.mockResolvedValue(
            JSON.stringify({
                encrypted: Buffer.from('enc').toString('base64'),
                iv: Buffer.from('iv').toString('base64'),
                authTag: Buffer.from('tag').toString('base64'),
            }),
        );
        mockedDecrypt.mockReturnValue('secret');
        mockedVerifyTotpCode.mockReturnValue(true);
        mockedGenerateBackupCodes.mockReturnValue(['c1', 'c2']);
        mockedHashBackupCodes.mockResolvedValue(['h1', 'h2']);
        mockedFindTwofaVersionForUpdate.mockResolvedValue(null);

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should wrap rollback failure when enabling 2fa', async () => {
        mockedCacheGet.mockResolvedValue(
            JSON.stringify({
                encrypted: Buffer.from('enc').toString('base64'),
                iv: Buffer.from('iv').toString('base64'),
                authTag: Buffer.from('tag').toString('base64'),
            }),
        );
        mockedDecrypt.mockReturnValue('secret');
        mockedVerifyTotpCode.mockReturnValue(true);
        mockedGenerateBackupCodes.mockReturnValue(['c1', 'c2']);
        mockedHashBackupCodes.mockResolvedValue(['h1', 'h2']);
        mockedFindTwofaVersionForUpdate.mockRejectedValue(new Error('db read failed'));
        queryMock.mockImplementation(async (sql: string) => {
            if (sql === 'ROLLBACK') {
                throw new Error('rollback failed');
            }

            return { rowCount: 1 };
        });

        await expect(
            enable2faService(
                { userId: 9, userName: 'u', ip: null, userAgent: null },
                { code: '123456', nonce: 'nonce' },
            ),
        ).rejects.toThrow('[userSecurityService.enable2fa.rollback] rollback failed');
    });

    it('should throw UserNotFoundError when disabling 2fa for missing user', async () => {
        mockedFindTwofaVersionForUpdate.mockResolvedValue(null);

        await expect(
            disable2faService({ userId: 9, userName: 'u', ip: null, userAgent: null }, null),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });

        expect(queryMock).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should soft-delete account and blacklist access token', async () => {
        mockedSoftDeleteUserAndRevokeSessions.mockResolvedValue(true);

        await softDeleteMyAccountService(
            { userId: 3, userName: 'u', ip: '1.1.1.1', userAgent: 'ua' },
            null,
        );

        expect(mockedHandleAccessTokenBlackList).toHaveBeenCalledOnce();
        expect(mockedWriteUserLogToDB).toHaveBeenCalledOnce();
        expect(queryMock).toHaveBeenCalledWith('COMMIT');
    });

    it('should throw UserNotFoundError when soft-delete target does not exist', async () => {
        mockedSoftDeleteUserAndRevokeSessions.mockResolvedValue(false);

        await expect(
            softDeleteMyAccountService(
                { userId: 3, userName: 'u', ip: '1.1.1.1', userAgent: 'ua' },
                null,
            ),
        ).rejects.toMatchObject({ name: 'UserNotFoundError' });
    });

    it('should wrap rollback failure when soft-deleting account', async () => {
        mockedSoftDeleteUserAndRevokeSessions.mockRejectedValue(new Error('db failed'));
        queryMock.mockImplementation(async (sql: string) => {
            if (sql === 'ROLLBACK') {
                throw new Error('rollback failed');
            }

            return { rowCount: 1 };
        });

        await expect(
            softDeleteMyAccountService(
                { userId: 3, userName: 'u', ip: '1.1.1.1', userAgent: 'ua' },
                null,
            ),
        ).rejects.toThrow('[userSecurityService.softDeleteMyAccount.rollback] rollback failed');
    });

    it('should rollback and wrap error when disable 2fa rollback fails', async () => {
        mockedFindTwofaVersionForUpdate.mockRejectedValue(new Error('db read failed'));
        queryMock.mockImplementation(async (sql: string) => {
            if (sql === 'ROLLBACK') {
                throw new Error('rollback failed');
            }

            return { rowCount: 1 };
        });

        await expect(
            disable2faService({ userId: 9, userName: 'u', ip: null, userAgent: null }, null),
        ).rejects.toThrow('[userSecurityService.disable2fa.rollback] rollback failed');
    });

    it('should call repository to revoke sessions during disable 2fa', async () => {
        mockedFindTwofaVersionForUpdate.mockResolvedValue(2);

        await disable2faService({ userId: 9, userName: 'u', ip: null, userAgent: null }, null);

        expect(mockedDisableTwofaAndRevokeSessions).toHaveBeenCalledOnce();
    });
});
