// jwtTwoToken.ts
import jwt, {SignOptions, JwtPayload, TokenExpiredError, JsonWebTokenError} from "jsonwebtoken";
import z from "zod";
import {logger} from "../lib/logger";

// 定義我們預期的 Token Payload 結構
interface TwoFaTokenPayload extends JwtPayload {
    sub: string; // 建議轉為字串
    type: "2fa";
}

function loadKey ():string {
    const rawKey:string | undefined = process.env.TWOFA_TOKEN_SECRET;

    if (!rawKey) {
        throw new Error("[jwt-2fa] 環境變數中未定義 TWOFA_TOKEN_SECRET")
    }

    return rawKey;
}

const TWOFA_TOKEN_KEY:string = loadKey();

// 2FA token payload schema
const twofaPayloadSchema = z.object({
    sub: z.string().regex(/^\d+$/),         // userId as digits
    type: z.literal("2fa"),
    jti: z.string().min(10),               // unique id for one-time use (recommend UUID)
});

export function signTwofaToken (userId:number): { token: string; jti: string; expiresInSec: number } {
    const jti = crypto.randomUUID();

    const payload = {
        sub: String(userId),
        type: "2fa",
        jti: jti,
    };

    const expiresInSec:number = 3 * 60;

    const options:SignOptions = {
        expiresIn: expiresInSec,
    }

    const token = jwt.sign(payload, TWOFA_TOKEN_KEY, options);

    return { token, jti, expiresInSec };
}


export function verifyTwofaToken (token:string): { ok: true; userId: number; jti: string } | { ok: false; reason: string; message: string } {
    try {
        // 限制演算法
        const decoded = jwt.verify(token, TWOFA_TOKEN_KEY, {algorithms:["HS256"]});

        // 檢查是否為物件
        if (typeof decoded === "string") {
            return {
                ok: false,
                reason: "malformed",
                message: 'Token payload 不是物件'
            };
        }

        const parsed = twofaPayloadSchema.safeParse(decoded);

        if (!parsed.success) {
            return { ok: false, reason: "invalid", message: "Token payload 格式不正確" };
        }

        const { sub, jti } = parsed.data;

        const userId = Number(sub);

        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return { ok: false, reason: "invalid", message: "userId 格式不正確" };
        }

        return { ok: true, userId, jti };
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

        logger.warn("[jwt-2fa] token驗證失敗:", err);

        return {
            ok: false,
            reason: 'unknown',
            message: "Token 驗證失敗"
        };
    }
}
