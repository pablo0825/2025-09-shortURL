// deviceInfo.ts
import { UAParser } from 'ua-parser-js';

type DeviceInfo = {
    deviceType: string; // mobile/tablet/desktop/console/smarttv/wearable/embedded/unknown
    deviceModel: string | null;
    deviceVendor: string | null;
    osName: string | null;
    osVersion: string | null;
    browserName: string | null;
    browserVersion: string | null;
};

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
        deviceType: device.type ?? 'desktop', // 若無 type 通常可視為 desktop
        deviceModel: device.model ?? null,
        deviceVendor: device.vendor ?? null,
        osName: os.name ?? null,
        osVersion: os.version ?? null,
        browserName: browser.name ?? null,
        browserVersion: browser.version ?? null,
    };
};
