// fs.utils.ts
import fs from "fs/promises";
import path from "path";

// 檢查資料夾是否存在
export async function ensureDir(dirPath:string):Promise<void> {
    // fs.mkdir 建立目錄
    // dirPath 是目標路徑，如:/app/uploads/avatars/user-99
    // recursive 遞迴建立，ture，建立通往目標路徑的資料夾。不過，如果資料夾已經存在，就會執行往下執行; false，父資料不存在，則會建立失敗
    // 遞迴會持續執行建立資料夾的動作，直到目標達成
    await fs.mkdir(dirPath, { recursive: true });
}

// 檢查路徑是否合法
export function safeJoin(base:string, ...parts:string[]):string {
    // .join 將基礎目錄(base)和子路徑片段(...parts)組成完整的路徑
    // p = /app/uploads/avatars/user-99
    const p:string = path.join(base, ...parts);

    // 正規化基礎目錄
    // .resolve 將路徑轉為絕對路徑
    // path.sep 系統的分隔符
    // /app/uploads/
    const normalizedBase:string = path.resolve(base) + path.sep;

    // 正規化最終路徑
    // 假設 p = /app/uploads/../../etc/passwd
    // .. 上一頁/層
    // .resolve() 可以檢查那些試圖跳出去的路徑的真身
    const normalizedPath:string = path.resolve(p);

    // 檢查最終路徑是否以基礎目錄開頭
    // .startsWith 可以檢查字串的開頭是否相同
    if (!normalizedPath.startsWith(normalizedBase)) {
        throw new Error("非法路徑")
    }

    // 修正成，返回絕對路徑
    return normalizedPath;
}