import jwt, { SignOptions, Secret } from "jsonwebtoken";

interface Payload {
    id: string;
    name: string;
    email: string;
    role?: string;
}

// [未完成] jwt工具有優化空間
export class jwtProvider {
    // 用private(私有)限制函數存取
    // access, refresh的私鑰
    private JWT_ACCESS_SECRET: string;
    private JWT_REFRESH_SECRET: string;
    // access, refresh的過期時間
    private JWT_ACCESS_EXPIRATION: string;
    private JWT_REFRESH_EXPIRATION: string;

    // 使用new建立一個實例時，constructor會自動執行一次
    // 簡單說，就是把東西都準備好，讓其他人可以使用
    // 初始化實例物件
    constructor() {
        // 把access, refresh的私鑰，從環境變數中拿出來存成變數
        const access_secret = process.env.JWT_ACCESS_SECRET;
        const refresh_secret = process.env.JWT_REFRESH_SECRET;
        // 把access, refresh的過期時間，從環境變數中拿出來存成變數
        const access_expires_in = process.env.JWT_ACCESS_EXPIRATION;
        const refresh_expires_in = process.env.JWT_REFRESH_EXPIRATION;
        // 檢查環境變數中是否有JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
        if (!access_secret) {
            throw new Error("[jwt] 環境變數中未定義 JWT_ACCESS_SECRET");
        }
        if (!refresh_secret) {
            throw new Error("[jwt] 環境變數中未定義 JWT_REFRESH_SECRET")
        }
        if (!access_expires_in) {
            throw new Error("[jwt] 環境變數中未定義 JWT_ACCESS_EXPIRATION");
        }
        if (!refresh_expires_in) {
            throw new Error("[jwt] 環境變數中未定義 JWT_REFRESH_EXPIRATION");
        }
        // 因為access_secret等等變數，只存在constructor中，如果constructor執行完的話，它們將會變成不存在的狀態。
        // 所以需要把access_secret等等變數，賦值給this.JWT_ACCESS_SECRET，讓變數可以一直被存取
        this.JWT_ACCESS_SECRET = access_secret;
        this.JWT_REFRESH_SECRET = refresh_secret;
        this.JWT_ACCESS_EXPIRATION = access_expires_in;
        this.JWT_REFRESH_EXPIRATION = refresh_expires_in;
    }

    // 產生 access token
    public generateAccessToken(payload: Payload): string {
        const secret: Secret = this.JWT_ACCESS_SECRET;
        const options: SignOptions = {
            // SignOptions["expiresIn"]表示的型別為string | number
            // 告訴編譯器說，我知道JWT_ACCESS_EXPIRATION是string，但相信我，這個字的值裡面有"1h"
            expiresIn: this.JWT_ACCESS_EXPIRATION as SignOptions["expiresIn"],
            algorithm: "HS256",
        };
        // payload 實際資料
        // secret 私鑰
        // options 選項設定，如:過期時間、指定演算法
        return jwt.sign(payload, secret, options);
    }

    // 產生 refresh token
    public generateRefreshToken(payload: Payload): string {
        const secret: Secret = this.JWT_REFRESH_SECRET;
        const options: SignOptions = {
            // SignOptions["expiresIn"]表示的型別為string | number
            // 告訴編譯器說，我知道JWT_ACCESS_EXPIRATION是string，但相信我，這個字的值裡面有"1h"
            expiresIn: this.JWT_REFRESH_EXPIRATION as SignOptions["expiresIn"],
            algorithm: "HS256",
        };
        // payload 實際資料，用id是因為refresh不用太多資料，因為它的用途很單純，就是幫助access重新被取得
        // 所以payload不用太多資料
        // secret 私鑰
        // options 選項設定，如:過期時間、指定演算法
        return jwt.sign({id: payload.id}, secret, options);
    }

    // 解碼
    public verifyToken(token: string, type: "access" | "refresh") {
        try {
            const secret = type === 'access' ? this.JWT_ACCESS_SECRET : this.JWT_REFRESH_SECRET;
            if (!token) {
                throw new Error("[jwt] 未提供token")
            }
            return jwt.verify(token, secret) as Payload;
        } catch (err) {
            console.error(`Token verification failed for type ${type}:`, err);
            return null;
        }
    }
}