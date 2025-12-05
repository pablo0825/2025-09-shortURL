// authenticateToken.ts
import {Request, Response, NextFunction} from "express";
import {jwtProvider} from "../utils/jwtProvider";
import {redisProvider} from "../utils/redisProvider";

const jwtAuthTool = new jwtProvider();
const redisAuthTool = new redisProvider();

export const authenticate = async (req: Request, res: Response, next:NextFunction) => {
    // authHeader = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
    const authHeader = req.headers.authorization;
    // startsWith 用來檢查字串是否用指定的輟詞開頭，像是Bearer
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({
            error:"headers 中的 authorization 不正確"
        })
    }

    // .split(" ") 表示用空白作為分割，得到一個陣列
    // [1] 取得陣列中的第二個元素
    const accessToken = authHeader && authHeader.split(" ")[1];
    if (!accessToken) {
        return res.status(401).json({
            error:"未提供 accessToken"
        })
    }

    try {
        // 檢查access token是否有在redis的黑名單內
        const blacklisted = await redisAuthTool.isInBlacklist(accessToken);
        if (blacklisted) {
            return res.status(401).json({
                ok:false,
                error: "Access Token 已失效，請重新登入"
            })
        }

        // 驗證jwt
        const decode = jwtAuthTool.verifyToken(accessToken, "access");
        const id = decode.claims?.id;
        const email = decode.claims?.email;
        const name = decode.claims?.name;
        const role = decode.claims?.role;

        // 檢查id, email, name, role等欄位
        if(!id || !email || !name || !role){
            return res.status(401).json({
                ok:false,
                error:"Access Token 資料不完整"
            })
        }

        // [標記] user底下要有一個permissions，就是這個角色的權限表
        req.user = {
            id: id,
            email: email,
            name: name,
            role: role,
        };

        return next();
    } catch (err) {
        console.error("[authenticate] access token 驗證失敗:", err);
        return res.status(401).json({
            ok: false,
            error: "Access Token 無效或已過期，請重新登入",
        });
    }
}

