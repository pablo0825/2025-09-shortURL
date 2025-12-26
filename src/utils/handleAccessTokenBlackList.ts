// handleAccessTokenBlacklist.ts
import {Request} from "express"
import {jwtProvider} from "./jwtProvider";
import {redisProvider} from "./redisProvider";

const jwtAuthTool = new jwtProvider();
const redisAuthTool = new redisProvider();

export async function handleAccessTokenBlackList (req: Request):Promise<void> {
    const authHeader = req.headers.authorization;

    // 檢查是否有提供 Access Token
    if (!authHeader?.startsWith("Bearer ")) {
        return; // 沒有提供就跳過，不影響登出流程
    }

    const accessToken = authHeader.split(" ")[1];
    if (!accessToken) {
        console.warn("Authorization header 格式錯誤");
        return;
    }

    try {
        // 驗證 Access Token 並取得過期時間
        const decode = jwtAuthTool.verifyToken(accessToken, "access");
        const exp = decode.claims?.exp;

        if (typeof exp === "number") {
            // 將 token 加入黑名單
            await redisAuthTool.addToBlacklist(accessToken, exp);
            console.log(`Access Token 已加入黑名單`);
        } else {
            console.warn("Access Token 中缺少 exp，無法加入黑名單");
        }
    } catch (err) {
        // Access Token 無效或已過期，不影響登出流程
        console.warn("Access Token 驗證失敗，略過黑名單處理:", err);
    }
}