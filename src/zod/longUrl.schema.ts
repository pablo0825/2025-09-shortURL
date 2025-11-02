// longUrl.schema.ts
import { z } from "zod";

const SAFE_SCHEMES = new Set(['http:', 'https:']);
const STRIP_PARAMS = new Set(['utm_source','utm_medium','utm_campaign','utm_term','utm_content']);
const ALLOWED_PORTS = new Set([80, 443]);
// const FORBIDDEN_RANGES = new Set(["loopback", "private", "linkLocal", "uniqueLocal"]);

type NormOpts = {
    maxLength?:number
    allowHash?: boolean,
    stripTrackingParams?:boolean,
    shortDomain?:string,
    allowNonStandardPorts?:boolean,
}

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
    } catch {}
    return false;
}

// 僅允許80, 443通過
function getEffectivePort (u: URL): number {
    // port必定為數字
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
}


export const longUrlSchema = (opts: NormOpts) => {
    const {
        maxLength = 2048,
        allowHash = true,
        stripTrackingParams = true,
        shortDomain,
        allowNonStandardPorts = false,
    } = opts;
    return z.string()
        .superRefine((v, ctx) => {
            // 原始控制字元（含 CR/LF）先擋一層
            // 這邊好像擋住了32種控制字元
            if (/[\u0000-\u001F\u007F]/.test(v)) {
                ctx.addIssue({ code: "custom", message: "URL有控制字元" });
                return;
            }
            if (hasDangerousNewlines(v)) {
                ctx.addIssue({ code: "custom", message: "URL含非法換行/回車符" });
            }
        })
        .min(1, "longUrl是必須的")
        .max(maxLength, "longUrl不能超過2048字元")
        .trim()
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
            // 禁用 URL 認證資訊（避免 user:pass@host）
            if (url.username || url.password) {
                throw new Error("不允許包含認證資訊的URL");
            }
            // 僅允許80, 443通行
            const port:number = getEffectivePort(url);
            if (!allowNonStandardPorts && !ALLOWED_PORTS.has(port)) {
                throw new Error("不允許的通訊埠，僅允許80, 443通行")
            }
            // 移除尾端點，轉成小寫
            // www.example.com. ⭢ www.example.com
            // WwW.eXaMpLe.CoM ⭢ www.example.com
            url.hostname = url.hostname.replace(/\.$/, '').toLowerCase();

            // 移除預設 port, example.com:443 ⭢ example.com
            if ((url.protocol === 'http:' && url.port === '80') ||
            (url.protocol === 'https:' && url.port === '443')) {
                url.port = '';
            }

            // https://example.com → https://example.com／
            if (!url.pathname) url.pathname = '/';

            // 合併連續斜線
            // /api//v1/users///profile → /api/v1/users/profile
            url.pathname = url.pathname.replace(/\/{2,}/g, '/');

            // 清理/排序 query 參數 (看不太懂)
            // url中的查詢參數的清理, 正規化
            // https://shop.example.com/item/123?medium=social&sort=price&session=abc&a=10&utm_source=fb_ad
            // https://shop.example.com/item/123?a=10&sort=price
            if (stripTrackingParams) {
                // 把查詢參數逐一拿出來，如果有符合的，就刪除該查詢參數
                for (const p of STRIP_PARAMS) url.searchParams.delete(p);

                // url.searchParams.entries() 取得剩餘的所有查詢參數
                // .sort() 排序
                // a.localeCompare() 基於件鍵值的key的字母排序
                const entries = Array.from(url.searchParams.entries()).sort(([a],[b]) => a.localeCompare(b));

                // 如果還有查詢參數就重組，沒有的話就接上空字串
                // ${encodeURIComponent(k)}=${encodeURIComponent(v)}
                // ['a', '10'] → a=10
                url.search = entries.length ? '?' + entries.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
            }

            // 是否保留#...後面的內容
            // https://example.com/page#section-3
            if(!allowHash) url.hash = "";

            // 禁止把短網址再次變成短網址
            if(shortDomain) {
                // 轉成小寫
                const sd = shortDomain.toLowerCase();

                if (url.hostname === sd || url.hostname.endsWith("." + sd)) {
                    throw new Error("不允許短網址作為長網址");
                }
            }

            const out = url.toString();

            // ✅ 最終長度再檢一次（transform 後）
            if (out.length > maxLength) {
                throw new Error("URL太長");
            }

            return out; })

};