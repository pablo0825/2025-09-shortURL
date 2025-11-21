import { jwtProvider } from "./utils/jwtProvider";
import dotenv from 'dotenv';
dotenv.config({ path: '../config.env' });

// ✅ 合法 AccessClaims
const okAccess: any = {
    id: "u_123",
    name: "Pablo Guo",
    email: "pablo@example.com",
    role: "admin",
};

// ❌ 不合法：缺少 email
const badAccess_missingEmail: any = {
    id: "u_124",
    name: "NoEmail User",
    role: "user",
};

// ❌ 不合法：email 格式錯誤
const badAccess_invalidEmail: any = {
    id: "u_125",
    name: "Invalid Email",
    email: "not-an-email",
};

// ✅ 合法 Refresh 原料（你的方法收 string，再由 zod parse 出 { id }）
const okRefreshId = "u_123";
const otherRefreshId = "u999"; // 可用來測「id 不同」的情境

const jwt = new jwtProvider();

function main() {
    const access = jwt.generateAccessToken(okAccess);
    const refresh = jwt.generateRefreshToken(otherRefreshId);
    console.log(access);
    console.log(refresh);

    // 驗證 access
    const v1 = jwt.verifyToken(access, "access");
    console.log("[verify access]", v1);

    // 驗證 refresh（用錯 type 模擬錯誤）
    const v2 = jwt.verifyToken(refresh, "access");
    console.log("[verify refresh with access secret -> expect invalid]", v2);

    // 驗證 refresh（正確）
    const v3 = jwt.verifyToken(refresh, "refresh");
    console.log("[verify refresh]", v3);
}

// main();

console.log(Date.now());