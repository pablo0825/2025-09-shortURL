import { UAParser } from 'ua-parser-js';


// deviceType 設備裝置
// deviceModel 設備型號
// deviceVendor 設備品牌
// osName 作業系統
// osVersion 作業系統版本
// browserName 瀏覽器名稱
// browserVersion 瀏覽器型號
export interface DeviceInfo {
    deviceType: string;
    deviceModel: string | null;
    deviceVendor: string | null;
    osName: string | null;
    osVersion: string | null;
    browserName: string | null;
    browserVersion: string | null;
}

export const parseUserAgentToDeviceInfo = (userAgent: string | null): DeviceInfo => {
    if (!userAgent) {
        return {
            deviceType: 'unknown',
            deviceModel: null,
            deviceVendor: null,
            osName: null,
            osVersion: null,
            browserName: null,
            browserVersion: null,
        };
    }

    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const os = parser.getOS();
    const browser = parser.getBrowser();

    return {
        deviceType: device.type ?? 'desktop',
        deviceModel: device.model ?? null,
        deviceVendor: device.vendor ?? null,
        osName: os.name ?? null,
        osVersion: os.version ?? null,
        browserName: browser.name ?? null,
        browserVersion: browser.version ?? null,
    };
};
