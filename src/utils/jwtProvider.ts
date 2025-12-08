// jwtProvider.ts
import jwt, { SignOptions, Secret, JwtPayload, TokenExpiredError, NotBeforeError, JsonWebTokenError } from "jsonwebtoken";
import { AccessPayloadSchema, RefreshPayloadSchema } from "../zod/jwt.schema";
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// 在原本的id, name, email, role等型別上，加上JwtPayload對型別的限制
// jwt的型別限制
// iss?: string | undefined;
// sub?: string | undefined;
// aud?: string | string[] | undefined;
// exp?: number | undefined;
// nbf?: number | undefined;
// iat?: number | undefined;
// jti?: string | undefined;
interface AccessClaims extends JwtPayload  {
    id: string;
    name: string;
    email: string;
    role?: string;
}

export class jwtProvider {
    // 用private(私有)限制函數存取
    // readonly 一但初始化，函數就無法修改，內外都一樣
    // access, refresh的私鑰
    private readonly JWT_ACCESS_SECRET: Secret;
    private readonly JWT_REFRESH_SECRET: Secret;
    // access, refresh的過期時間
    private readonly JWT_ACCESS_EXPIRES_IN: string | number;
    private readonly JWT_REFRESH_EXPIRES_IN: string | number;
    // 簽發者, 接收者, 時間偏差的容忍值
    private readonly ISSUER?: string;
    private readonly AUDIENCE?: string;
    private readonly CLOCK_TOLERANCE_SEC: number;

    // 使用new建立一個實例時，constructor會自動執行一次
    // 簡單說，就是把東西都準備好，讓其他人可以使用
    // 初始化實例物件
    constructor() {
        // 把access, refresh的私鑰，從環境變數中拿出來存成變數
        const accessSecret = process.env.JWT_ACCESS_SECRET;
        const refreshSecret = process.env.JWT_REFRESH_SECRET;
        // 把access, refresh的過期時間，從環境變數中拿出來存成變數
        const accessExp = process.env.JWT_ACCESS_EXPIRES_IN; // 15m
        const refreshExp = process.env.JWT_REFRESH_EXPIRES_IN;// 7d
        // 發行參數
        const issuer = process.env.ISSUER;
        const audience = process.env.AUDIENCE;
        const clockTol = process.env.CLOCK_TOLERANCE_SEC ?? "15"; // 預設 15 秒
        // 檢查環境變數中是否有JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
        if (!accessSecret) throw new Error("[jwt] 環境變數中未定義 JWT_ACCESS_SECRET");
        if (!refreshSecret) throw new Error("[jwt] 環境變數中未定義 JWT_REFRESH_SECRET")
        if (!accessExp) throw new Error("[jwt] 環境變數中未定義 JWT_ACCESS_EXPIRES_IN");
        if (!refreshExp) throw new Error("[jwt] 環境變數中未定義 JWT_REFRESH_EXPIRES_IN");
        // 因為access_secret等等變數，只存在constructor中，如果constructor執行完的話，它們將會變成不存在的狀態。
        // 所以需要把access_secret等等變數，賦值給this.JWT_ACCESS_SECRET，讓變數可以一直被存取
        this.JWT_ACCESS_SECRET = accessSecret;
        this.JWT_REFRESH_SECRET = refreshSecret;
        // isNaN()檢查傳入變數是否為有效數字
        // Number()把傳入變數轉換為數字
        // 檢查數字是否有效，有的話傳Number(accessExp)，沒有的話傳原值
        this.JWT_ACCESS_EXPIRES_IN = isNaN(Number(accessExp)) ? accessExp : Number(accessExp);
        this.JWT_REFRESH_EXPIRES_IN = isNaN(Number(refreshExp)) ? refreshExp : Number(refreshExp);
        //
        this.ISSUER = issuer;
        this.AUDIENCE = audience;
        this.CLOCK_TOLERANCE_SEC = Number(clockTol);
    }

    // [功能1] 產生 access token
    public generateAccessToken(raw: AccessClaims): string {
        // zod驗證
        const payload = AccessPayloadSchema.parse(raw);
        const options: SignOptions = {
            // SignOptions["expiresIn"]表示的型別為string | number
            // 告訴編譯器說，我知道JWT_ACCESS_EXPIRATION是string，但相信我，這個字的值裡面有"1h"
            // 加入發行人, 接收人, 偏差容忍時間等參數
            // 例子，exp:1763540100
            expiresIn: this.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
            algorithm: "HS256",
            issuer: this.ISSUER,
            audience: this.AUDIENCE,
            subject: payload.id, // 建議把 id 放在 sub，也會同時保留在 payload
        };
        // payload 實際資料
        // secret 私鑰
        // options 選項設定，如:過期時間、指定演算法
        return jwt.sign(payload, this.JWT_ACCESS_SECRET, options);
    }

    // [功能2] 產生 refresh token
    public generateRefreshToken(raw: string): string {
        console.log(raw);
        const id = RefreshPayloadSchema.parse(raw);
        const options: SignOptions = {
            // SignOptions["expiresIn"]表示的型別為string | number
            // 告訴編譯器說，我知道JWT_ACCESS_EXPIRATION是string，但相信我，這個字的值裡面有"1h"
            expiresIn: this.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
            algorithm: "HS256",
            issuer: this.ISSUER,
            audience: this.AUDIENCE,
            subject: id.toString(), // 建議把 id 放在 sub，也會同時保留在 payload
        };
        // payload 實際資料，用id是因為refresh不用太多資料，因為它的用途很單純，就是幫助access重新被取得
        // 所以payload不用太多資料，用id就好
        // secret 私鑰
        // options 選項設定，如:過期時間、指定演算法
        return jwt.sign({id: id}, this.JWT_REFRESH_SECRET, options);
    }

    // [功能3] token解碼
    public verifyToken(token: string, type: "access" | "refresh") {
        if (!token) {
            return { ok: false, reason: "invalid", msg: "[jwt]] token是必須的!" };
        }
        // 判斷傳入type是access，還是refresh
        // 決定secret的私鑰是哪一把
        const secret = type === 'access' ? this.JWT_ACCESS_SECRET : this.JWT_REFRESH_SECRET;

        try {
            const claims = jwt.verify(token, secret, {
                algorithms: ["HS256"],
                issuer: this.ISSUER,
                audience: this.AUDIENCE,
                clockTolerance: this.CLOCK_TOLERANCE_SEC,
            });

            // claims應該要是物件
            if (typeof claims === "string") {
                return { ok: false, reason: "invalid", msg: "[jwt] token payload不是物件!" };
            }

            // claims需要包含subject或id
            if (!claims.sub && !claims.id) {
                return { ok: false, reason: "invalid", msg: "[jwt] 缺少 subject或id" };
            }

            //
            const id = (claims.sub as string) ?? (claims.id as string);
            const normalized:AccessClaims = {...claims, id} as AccessClaims;

            return { ok: true, claims: normalized };
        } catch (err) {
            // token過期錯誤
            if (err instanceof TokenExpiredError) {
                return { ok: false, reason: "expired", msg: err.message };
            }

            // 生效時間未到錯誤，簡單說，就是還沒到可以使用的時候
            if (err instanceof NotBeforeError) {
                return { ok: false, reason: "notBefore", msg: err.message };
            }

            // 一般的jwt錯誤，如：簽名不匹配, 無效的發簽者
            if (err instanceof JsonWebTokenError) {
                return { ok: false, reason: "invalid", msg: err.message };
            }

            // 其他錯誤
            return { ok: false, reason: "other", msg: (err as Error).message };
        }
    }
}