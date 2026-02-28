import { pool } from '../../db/pool';

export interface UserProfileRow {
    nickname: string;
    email: string;
    job_title: string | null;
    unit: string | null;
    phone: string | null;
    avatar_key: string | null;
    twofa_enabled: boolean;
    is_active: boolean;
    type: string;
}

export interface UpdatedUserProfileRow {
    nickname: string;
    unit: string | null;
    phone: string | null;
    job_title: string | null;
}

export const findProfileByUserId = async (userId: number): Promise<UserProfileRow | null> => {
    const result = await pool.query<UserProfileRow>(
        `SELECT
      u.nickname,
      u.email,
      u.job_title,
      u.unit,
      u.phone,
      u.avatar_key,
      u.twofa_enabled,
      u.is_active,
      r.type
    FROM users u
    JOIN user_role ur ON u.id = ur.user_id
    JOIN role r ON ur.role_id = r.id
    WHERE u.id = $1
      AND u.is_active IS TRUE`,
        [userId],
    );

    return result.rowCount ? result.rows[0] : null;
};

export const updateProfileByUserId = async (
    userId: number,
    params: {
        nickname: string;
        unit: string;
        phone: string;
        jobTitle: string;
    },
): Promise<UpdatedUserProfileRow | null> => {
    const result = await pool.query<UpdatedUserProfileRow>(
        'UPDATE users SET nickname = $1, unit = $2, phone = $3, job_title = $4 WHERE id = $5 AND is_active IS TRUE RETURNING nickname, unit, phone, job_title',
        [params.nickname, params.unit, params.phone, params.jobTitle, userId],
    );

    return result.rowCount ? result.rows[0] : null;
};
