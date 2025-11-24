// pool.ts
import dotenv from 'dotenv';
dotenv.config({path: ".env"});
import pg from 'pg';

// console.log(process.env.DATABASE_HOST);
// console.log(process.env.DATABASE_URL);
// console.log(process.env.DATABASE_NAME);
// console.log(process.env.DATABASE_USERNAME);
// console.log(process.env.DATABASE_HOST);

// 檢查環境變數是否有設定
if (
    !process.env.DATABASE_HOST ||
    !process.env.DATABASE_USER ||
    !process.env.DATABASE_PASSWORD ||
    !process.env.DATABASE_NAME ||
    !process.env.DATABASE_PORT
) {
    throw new Error("host, userName, password, database, port等環境變數未設定");
}

// 建立連線池
const { Pool } = pg;

// 設定資料庫的帳號密碼等資訊
export const pool = new Pool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    // ssl: true,
});

// 錯誤監聽
pool.on('error', (err) => {
    // 當資料庫遇到 網路中斷、DB crash 等錯誤時，輸入一個log資訊
    console.error("意外的client錯誤", err);
})
