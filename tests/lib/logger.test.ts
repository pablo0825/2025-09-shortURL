import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/lib/logger';

describe('logger', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should forward info logs to console.info', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

        logger.info('hello', 123);

        expect(infoSpy).toHaveBeenCalledWith('hello', 123);
    });

    it('should forward warn logs to console.warn', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        logger.warn('warn-message');

        expect(warnSpy).toHaveBeenCalledWith('warn-message');
    });

    it('should forward error logs to console.error', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const err = new Error('fail');
        logger.error('error-message', err);

        expect(errorSpy).toHaveBeenCalledWith('error-message', err);
    });
});
