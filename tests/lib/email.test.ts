import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockVerify = vi.fn();
const mockSendMail = vi.fn();
const createTransport = vi.fn(() => ({
    verify: mockVerify,
    sendMail: mockSendMail,
}));

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

vi.mock('nodemailer', () => ({
    default: {
        createTransport,
    },
}));

vi.mock('../../src/lib/logger', () => ({
    logger: mockLogger,
}));

describe('email', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('should throw when required env vars are missing', async () => {
        delete process.env.EMAIL_USER;
        delete process.env.EMAIL_PASSWORD;
        await expect(import('../../src/lib/email')).rejects.toThrow(
            '[Email] EMAIL_USER, EMAIL_PASSWORD等環境變數未設定',
        );
    });

    it('should verify smtp connection and log success', async () => {
        process.env.EMAIL_USER = 'bot@example.com';
        process.env.EMAIL_PASSWORD = 'password';
        mockVerify.mockResolvedValue(undefined);

        const module = await import('../../src/lib/email');
        await module.verifyEmailConnection();

        expect(mockVerify).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should send email with expected payload', async () => {
        process.env.EMAIL_USER = 'bot@example.com';
        process.env.EMAIL_PASSWORD = 'password';
        mockSendMail.mockResolvedValue({ messageId: 'm-1' });

        const module = await import('../../src/lib/email');
        const result = await module.sendEmail({
            to: 'user@example.com',
            subject: 's',
            html: '<b>h</b>',
            text: 't',
        });

        expect(mockSendMail).toHaveBeenCalledWith(
            expect.objectContaining({
                from: '"Your App" <bot@example.com>',
                to: 'user@example.com',
                subject: 's',
            }),
        );
        expect(result).toEqual({ messageId: 'm-1' });
    });

    it('should wrap send error message', async () => {
        process.env.EMAIL_USER = 'bot@example.com';
        process.env.EMAIL_PASSWORD = 'password';
        mockSendMail.mockRejectedValue(new Error('smtp down'));

        const module = await import('../../src/lib/email');
        await expect(
            module.sendEmail({
                to: 'user@example.com',
                subject: 's',
                html: '<b>h</b>',
                text: 't',
            }),
        ).rejects.toThrow('寄信失敗: smtp down');
    });
});
