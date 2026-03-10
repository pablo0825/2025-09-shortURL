import { UAParser } from 'ua-parser-js';

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

const BOT_PATTERN = /bot|crawl|spider|slurp|facebookexternalhit/i;

export const parseDeviceType = (ua: string | null): DeviceType => {
    if (!ua) return 'unknown';
    if (BOT_PATTERN.test(ua)) return 'bot';

    const parser = new UAParser(ua);
    const deviceType = parser.getDevice().type;

    if (deviceType === 'mobile') return 'mobile';
    if (deviceType === 'tablet') return 'tablet';
    if (!deviceType) return 'desktop';

    return 'unknown';
};
