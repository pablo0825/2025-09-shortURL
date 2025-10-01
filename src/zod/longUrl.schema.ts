import { z } from "zod";

const SAFE_SCHEMES = new Set(['http:', 'https:']);
const STRIP_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content']);

type NormOpts = {
    maxLength?:number
    allowHash?: boolean,
    stripTrackingParams?:boolean,
    shortDomain?:string
}

export const longUrlSchema = (opts: NormOpts) => {
    const {
        maxLength = 2048,
        allowHash = true,
        stripTrackingParams = true,
        shortDomain
    } = opts;
    // 驗證(1)驗證字串 (2)移除前後空白 (3)確保URL不為空 (4)限制URL長度 (5)禁止控制字元
    return z.string()
        .trim()
        .min(1, "longURL是必須的")
        .max(maxLength, "URL太長")
        .refine(v => !/[\u0000-\u001F\u007F]/.test(v), "URL有控制字元")
        .transform((raw) => {
            let url:URL;
            // 驗證是否為URL
            try {
                url = new URL(raw);
            } catch {
                throw new Error("無效的URL");
            }
            // 只允許http, https，其他都拒絕
            if (!SAFE_SCHEMES.has(url.protocol)) {
                throw new Error("只支援http, https，其他都拒絕")
            }
            // 小寫, 移除尾端點
            url.hostname = url.hostname.replace(/\.$/, '').toLowerCase();

            // 移除預設 port, example.com:443 ⭢ example.com
            if ((url.protocol === 'http:' && url.port === '80') ||
            (url.protocol === 'https:' && url.port === '443')) {
                url.port = '';
            }

            // 空路徑 → '/'
            if (!url.pathname) url.pathname = '/';

            // 合併連續斜線
            url.pathname = url.pathname.replace(/\/{2,}/g, '/');

            // 清理/排序 query 參數 (看不太懂)
            if (stripTrackingParams) {
                for (const p of STRIP_PARAMS) url.searchParams.delete(p);

                const entries = Array.from(url.searchParams.entries()).sort(([a],[b]) => a.localeCompare(b));

                url.search = entries.length ? '?' + entries.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
            }

            // 是否保留#...後面的內容
            if(!allowHash) url.hash = "";

            // 禁止把短網址再次變成短網址
            if(shortDomain) {
                const sd = shortDomain.toLowerCase();

                if (url.hostname === sd || url.hostname.endsWith("." + sd)) {
                    throw new Error("不允許短網址作為長網址");
                }
            }

            return url.toString();
    })
};