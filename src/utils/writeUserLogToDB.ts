// writeUserLogToDB.ts
import {pool} from "../pool";
import type {PoolClient} from "pg";
import {UserLogActionEnum} from "../enum/userLogAction.enum";

interface UserLgoOptions {
    detail?: string;
    // Record<keys, type>
    // Record 是ts的泛用型別
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
    userAgent?: string | null;
}

export async function writeUserLogToDB(
        userId:number,
        action:UserLogActionEnum,
        userLog: UserLgoOptions = {},
        client?: PoolClient
):Promise<void> {
    const { detail = null,
        metadata = {},
        ipAddress = null,
        userAgent = null
    } = userLog;
    
    try {
        const queryRunner = client || pool;

        await queryRunner.query('INSERT INTO user_log(user_id, action, detail,metadata, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6)', [userId, action, detail, metadata, ipAddress, userAgent]);
    } catch (err) {
        console.error("[user_log] 寫入失敗", { err, userId, action });
    }
}