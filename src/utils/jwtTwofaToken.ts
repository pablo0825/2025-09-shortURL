// jwtTwoToken.ts
import jwt, {SignOptions, JwtPayload, TokenExpiredError, JsonWebTokenError} from "jsonwebtoken";

// 定義我們預期的 Token Payload 結構
interface TwoFaTokenPayload extends JwtPayload {
    sub: string; // 建議轉為字串
    type: "2fa";
}

function loadKey ():string {
    const rawKey:string | undefined = process.env.TWOFA_TOKEN_SECRET

    if (!rawKey) {
        throw new Error("[jwt-2fa] 環境變數中未定義 TWOFA_TOKEN_SECRET")
    }

    return rawKey;
}

const TWOFA_TOKEN_KEY:string = loadKey();

export function signTwofaToken (userId:number):string {
    const payload = {
        sub: String(userId),
        type: "2fa",
    };

    const options:SignOptions = {
        expiresIn: "5m",
    }

    return jwt.sign(payload, TWOFA_TOKEN_KEY, options);
}

export function verifyTwofaToken (token:string): { ok:true, userId: number } | {ok:false, reason?: string, message?: string } {
    try {
        const payload = jwt.verify(token, TWOFA_TOKEN_KEY);

        // 檢查是否為物件
        if (typeof payload === "string") {
            return {
                ok: false,
                reason: "malformed",
                message: 'Token payload 不是物件'
            };
        }

        // 檢查簽章類型
        if (payload.type === "2fa") {
            return {
                ok: false,
                reason: "invalid",
                message: 'Token 類型不正確'
            };
        }

        // 強制轉型，轉成我們簽發的格式
        const p = payload as TwoFaTokenPayload;

        // 確保sub存在
        if (!p.sub) {
            return {
                ok: false,
                reason: "invalid",
                message: '缺少有效的 sub 欄位'
            };
        }

        // 轉換為數字並驗證
        // paresInt 會從字串轉為整數，除非遇到第一個非number的字元
        const userId:number = parseInt(p.sub, 10);

        // 測試userId是否為整數
        if (!Number.isInteger(userId) || userId <= 0) {
            return {
                ok: false,
                reason: "invalid",
                message: 'userId 格式不正確'
            };
        }

        return { ok:true, userId:userId };
    } catch (err) {
        if (err instanceof TokenExpiredError) {
            return {
                ok: false,
                reason: 'expired',
                message: 'Token 已過期'
            };
        }

        if (err instanceof JsonWebTokenError) {
            return {
                ok: false,
                reason: 'invalid',
                message: err.message
            };
        }

        console.warn("[jwt-2fa] token驗證失敗:", err);

        return {
            ok: false,
            reason: 'unknown',
            message: "Token 驗證失敗"
        };
    }
}