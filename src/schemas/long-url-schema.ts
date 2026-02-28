// long-url-schema.ts
import { z } from 'zod';

const SAFE_SCHEMES = new Set(['http:', 'https:']);
const STRIP_PARAMS = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
]);
const ALLOWED_PORTS = new Set([80, 443]);
// const FORBIDDEN_RANGES = new Set(["loopback", "private", "linkLocal", "uniqueLocal"]);

type NormOpts = {
    maxLength?: number;
    allowHash?: boolean;
    stripTrackingParams?: boolean;
    shortDomain?: string;
    allowNonStandardPorts?: boolean;
};

// 1) 危險換行檢查（涵蓋真換行、字面 \n/\r、%0A/%0D、以及 decode 後）
// 預防http header injection和log injection的攻擊
function hasDangerousNewlines(input: string): boolean {
    // 捕捉直接的換行字元，如：
    // \r (Carriage Return, 回車)
    // \n (Line Feed, 換行)
    // \u2028 (Line Separator, 行分隔符)
    // \u2029 (Paragraph Separator, 段落分隔符)
    if (/[\r\n\u2028\u2029]/.test(input)) return true;
    // 捕捉未被解析到的非法字元，如：\n 或 \r
    if (/\\[rn]/i.test(input)) return true;
    // 捕捉常見的URL編碼，如：
    // %0d：\r 的 URL 編碼
    // %0a：\n 的 URL 編碼
    if (/%0d|%0a/i.test(input)) return true;
    // 第二次檢查
    try {
        // decodeURLComponent 還原被編碼過的rul
        // ％ 百分號
        // 兩位16進制
        // %3f = ?
        const decoded = decodeURIComponent(input);
        // 檢查是否有非法字元
        // .test() 用來檢查傳入的字串中，是否有正規表達式中的字元
        if (/[\r\n\u2028\u2029]/.test(decoded)) return true;
    } catch {
        // 無法解碼視為可疑輸入
        return true;
    }
    return false;
}

// 僅允許80, 443通過
function getEffectivePort(u: URL): number {
    // port必定為數字
    if (u.port) return Number(u.port);
    return u.protocol === 'https:' ? 443 : 80;
}

interface NormalizeResult {
    ok: boolean;
    value?: string;
    message?: string;
}

const normalizeLongUrl = (raw: string, opts: NormOpts): NormalizeResult => {
    const {
        maxLength = 2048,
        allowHash = true,
        stripTrackingParams = true,
        shortDomain,
        allowNonStandardPorts = false,
    } = opts;

    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, message: '無效的URL' };
    }

    if (!SAFE_SCHEMES.has(url.protocol)) {
        return { ok: false, message: '只支援http, https，其他都拒絕' };
    }

    if (url.username || url.password) {
        return { ok: false, message: '不允許包含認證資訊的URL' };
    }

    const port = getEffectivePort(url);
    if (!allowNonStandardPorts && !ALLOWED_PORTS.has(port)) {
        return { ok: false, message: '不允許的通訊埠，僅允許80, 443通行' };
    }

    url.hostname = url.hostname.replace(/\.$/, '').toLowerCase();

    if (
        (url.protocol === 'http:' && url.port === '80') ||
        (url.protocol === 'https:' && url.port === '443')
    ) {
        url.port = '';
    }

    if (!url.pathname) {
        url.pathname = '/';
    }

    // //連續出現兩次，替換成 /
    url.pathname = url.pathname.replace(/\/{2,}/g, '/');

    if (stripTrackingParams) {
        // 原本的 url ，如：https://example.com/page?utm_source=google&utm_medium=cpc&id=123
        // 而 STRIP_PARAMS 有 ['utm_source', 'utm_medium']
        // 那 url 中的 'utm_source', 'utm_medium' 會被移除
        // 變成：https://example.com/page?id=123
        // 這是一種標準化 url 的做法
        for (const p of STRIP_PARAMS) {
            url.searchParams.delete(p);
        }

        // 把 query 參數取出，轉成陣列
        //   https://example.com/page?z=9&b=2&a=1
        // url.searchParams.entries()，取出參數的鍵值對，如：：['z', '9'], ['b', '2'], ['a', '1']
        // 轉成陣列
        // sort 比大小，z 比 b 小，所以 b 往前排，大概是這個概念
        const entries = Array.from(url.searchParams.entries()).sort(([a], [b]) =>
            a.localeCompare(b),
        );

        // 重新組合 url 的 query string (查詢參數)
        // [k, v] = [z ,9]
        // '?a=1&b=2...'
        // encodeURIComponent 會把特殊字元做 url 的編碼
        url.search = entries.length
            ? '?' +
              entries
                  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                  .join('&')
            : '';
    }

    if (!allowHash) {
        url.hash = '';
    }

    if (shortDomain) {
        const sd = shortDomain.toLowerCase();
        if (url.hostname === sd || url.hostname.endsWith('.' + sd)) {
            return { ok: false, message: '不允許短網址作為長網址' };
        }
    }

    const out = url.toString();
    if (out.length > maxLength) {
        return { ok: false, message: 'URL太長' };
    }

    return { ok: true, value: out };
};

export const longUrlSchema = (opts: NormOpts) => {
    const { maxLength = 2048 } = opts;

    return z
        .string()
        .superRefine((v, ctx) => {
            // 原始控制字元（含 CR/LF）先擋一層
            // 這邊好像擋住了32種控制字元
            if (/[\u0000-\u001F\u007F]/.test(v)) {
                ctx.addIssue({ code: 'custom', message: 'URL有控制字元' });
                return;
            }
            if (hasDangerousNewlines(v)) {
                ctx.addIssue({ code: 'custom', message: 'URL含非法換行/回車符' });
            }
        })
        .min(1, 'longUrl是必須的')
        .max(maxLength, 'longUrl不能超過2048字元')
        .trim()
        .superRefine((raw, ctx) => {
            const normalized = normalizeLongUrl(raw, opts);
            if (!normalized.ok) {
                ctx.addIssue({
                    code: 'custom',
                    message: normalized.message ?? '無效的URL',
                });
            }
        })
        .transform((raw) => {
            const normalized = normalizeLongUrl(raw, opts);
            return normalized.value ?? raw;
        });
};
