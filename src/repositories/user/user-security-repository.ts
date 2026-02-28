import type { PoolClient } from 'pg';

export interface UserAvatarRow {
    avatar_key: string | null;
}

export interface UserAvatarLookup {
    exists: boolean;
    avatarKey: string | null;
}

export interface TwofaVersionRow {
    twofa_backup_codes_version: number;
}

export const findActiveUserAvatarForUpdate = async (
    client: PoolClient,
    userId: number,
): Promise<UserAvatarLookup> => {
    const result = await client.query<UserAvatarRow>(
        'SELECT avatar_key FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
        [userId],
    );

    if (result.rowCount === 0) {
        return {
            exists: false,
            avatarKey: null,
        };
    }

    return {
        exists: true,
        avatarKey: result.rows[0].avatar_key,
    };
};

export const updateUserAvatarKey = async (
    client: PoolClient,
    userId: number,
    avatarKey: string,
): Promise<boolean> => {
    const result = await client.query(
        'UPDATE users SET avatar_key = $1, avatar_updated_at = now() WHERE id = $2 AND is_active = TRUE',
        [avatarKey, userId],
    );

    return (result.rowCount ?? 0) > 0;
};

export const clearUserAvatarKey = async (client: PoolClient, userId: number): Promise<boolean> => {
    const result = await client.query(
        'UPDATE users SET avatar_key = NULL, avatar_updated_at = NULL WHERE id = $1 AND is_active = TRUE',
        [userId],
    );

    return (result.rowCount ?? 0) > 0;
};

export const findTwofaVersionForUpdate = async (
    client: PoolClient,
    userId: number,
): Promise<number | null> => {
    const result = await client.query<TwofaVersionRow>(
        'SELECT twofa_backup_codes_version FROM users WHERE id = $1 AND is_active = TRUE FOR UPDATE',
        [userId],
    );

    if (result.rowCount === 0) {
        return null;
    }

    return result.rows[0].twofa_backup_codes_version;
};

export const enableTwofaForUser = async (
    client: PoolClient,
    userId: number,
    encrypted: Buffer,
    iv: Buffer,
    authTag: Buffer,
    newVersion: number,
): Promise<void> => {
    await client.query(
        'UPDATE users SET twofa_enabled = TRUE, twofa_secret_encrypted = $1, twofa_secret_iv = $2, twofa_secret_auth_tag = $3, twofa_enabled_at = now(), twofa_backup_codes_version = $4 WHERE id = $5 AND is_active = TRUE',
        [encrypted, iv, authTag, newVersion, userId],
    );
};

export const insertBackupCodeHashes = async (
    client: PoolClient,
    userId: number,
    version: number,
    hashes: string[],
): Promise<void> => {
    const values: string = hashes.map((_, index) => `($1, $2, $${index + 3})`).join(', ');
    const params: Array<number | string> = [userId, version, ...hashes];

    await client.query(
        `INSERT INTO user_backup_codes(user_id, version, code_hash) VALUES ${values}`,
        params,
    );
};

export const disableTwofaAndRevokeSessions = async (
    client: PoolClient,
    userId: number,
    oldVersion: number,
): Promise<void> => {
    await client.query(
        'UPDATE users SET twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE',
        [userId],
    );

    await client.query(
        'UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND version = $2 AND revoked_at IS NULL',
        [userId, oldVersion],
    );

    await client.query(
        'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );

    await client.query(
        'UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL',
        ['disable_2fa', userId],
    );
};

export const softDeleteUserAndRevokeSessions = async (
    client: PoolClient,
    userId: number,
): Promise<boolean> => {
    const result = await client.query(
        'UPDATE users SET deleted_at = now(), is_active = FALSE, twofa_enabled = FALSE, twofa_secret_encrypted = NULL, twofa_secret_iv = NULL, twofa_secret_auth_tag = NULL, twofa_enabled_at = NULL, twofa_backup_codes_version = 0 WHERE id = $1 AND is_active = TRUE',
        [userId],
    );

    const affectedRows = result.rowCount ?? 0;
    if (affectedRows === 0) {
        return false;
    }

    await client.query(
        'UPDATE user_backup_codes SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );

    await client.query(
        'UPDATE refresh_token SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
    );

    await client.query(
        'UPDATE session SET revoked_at = now(), reason = $1 WHERE user_id = $2 AND revoked_at IS NULL',
        ['soft_delete', userId],
    );

    return true;
};
