import { logger } from './logger';

const PRIVATE_IP_PATTERN = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)|(^::1$)|(^$)/;

interface IpApiResponse {
    countryCode?: string;
    status?: string;
}

export const fetchCountryCode = async (ip: string | null): Promise<string | null> => {
    if (!ip || PRIVATE_IP_PATTERN.test(ip)) return null;

    try {
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode`);
        if (!response.ok) return null;

        const data = await response.json() as IpApiResponse;
        if (data.status !== 'success' || !data.countryCode) return null;

        return data.countryCode;
    } catch (err) {
        logger.warn('[geoIp.fetchCountryCode] 查詢失敗', { err, ip });
        return null;
    }
};
