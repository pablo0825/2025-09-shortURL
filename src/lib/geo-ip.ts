import { logger } from './logger';

// 不應該被拿去查的公開 ip
const PRIVATE_IP_PATTERN = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|(^::1$)|(^$)/;

// status 狀態，如: success
// countryCode 國家代碼
interface IpApiResponse {
    countryCode?: string;
    status?: string;
}

// 用 ip 去查國家代碼
export const fetchCountryCode = async (ip: string | null): Promise<string | null> => {
    // ip 不存在，或是 ip 是非公開，就回傳 null
    // 先做過濾
    if (!ip || PRIVATE_IP_PATTERN.test(ip)) return null;

    try {
        // 呼叫外部 api
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`);
        if (!response.ok) return null;

        // 把資料解析成 json，型別參考 IpApiResponse
        const data = await response.json() as IpApiResponse;
        // data 中沒有 success 或是 國家代碼，就返回 null
        if (data.status !== 'success' || !data.countryCode) return null;

        return data.countryCode;
    } catch (err) {
        logger.warn('[geoIp.fetchCountryCode] 查詢失敗', { err, ip });
        return null;
    }
};
