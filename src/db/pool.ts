import pg from 'pg';
import { logger } from '../lib/logger';

if (
    !process.env.DATABASE_HOST ||
    !process.env.DATABASE_USER ||
    !process.env.DATABASE_PASSWORD ||
    !process.env.DATABASE_NAME ||
    !process.env.DATABASE_PORT
) {
    throw new Error('host, userName, password, database, port等環境變數未設定');
}

const { Pool } = pg;

export const pool = new Pool({
    host: process.env.DATABASE_HOST,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    port: Number(process.env.DATABASE_PORT ?? 5432),
});

pool.on('error', (err: Error) => {
    logger.error('意外的client錯誤', err);
});
