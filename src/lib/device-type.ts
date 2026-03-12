import { UAParser } from 'ua-parser-js';

// tablet 平板
// bot 爬蟲
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'bot' | 'unknown';

// 最後的 i 表示忽略大小寫
const BOT_PATTERN = /bot|crawl|spider|slurp|facebookexternalhit/i;

export const parseDeviceType = (ua: string | null): DeviceType => {
    if (!ua) return 'unknown';
    // 用正規表達式檢查是不是機器人
    // 先手動過濾掉機器人，避免汙染 link click 的結果
    if (BOT_PATTERN.test(ua)) return 'bot';

    const parser = new UAParser(ua);
    const deviceType = parser.getDevice().type;

    if (deviceType === 'mobile') return 'mobile';
    if (deviceType === 'tablet') return 'tablet';
    // 沒有 device type 就用 desktop 當作預設
    if (!deviceType) return 'desktop';

    return 'unknown';
};
