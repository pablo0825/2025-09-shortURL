import type { PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import { pool } from '../db/pool';
import { sendEmail } from '../lib/email';
import { handleAccessTokenBlackList } from '../utils/handle-access-token-black-list';
import { writeUserLogToDB } from '../utils/write-user-log-to-db';
import { UserLogActionEnum } from '../enum/user-log-action-enum';
import { buildPasswordResetEmail } from '../utils/email-templates';
import {
  getUserAuthById,
  revokeRefreshTokens,
  revokeSessions,
  updatePasswordWithCheck,
} from '../repositories/user-auth-repository';

export type ChangeMyPasswordParams = {
  userId: number;
  currentPassword: string;
  newPassword: string;
  ip: string;
  userAgent: string | null;
  authorizationHeader?: string | null;
};

export const changeMyPasswordService = async (params: ChangeMyPasswordParams) => {
  const { userId, currentPassword, newPassword, ip, userAgent, authorizationHeader } = params;

  let client: PoolClient | undefined;

  const user = await getUserAuthById(userId);
  if (!user) {
    const err = new Error('user not found');
    err.name = 'UserNotFoundError';
    throw err;
  }

  const { passwordHash, nickname, email } = user;
  const isSamePassword: boolean = await bcrypt.compare(currentPassword, passwordHash);
  if (!isSamePassword) {
    const err = new Error('password mismatch');
    err.name = 'PasswordMismatchError';
    throw err;
  }

  const newPasswordHash: string = await bcrypt.hash(newPassword, 10);

  try {
    const dbClient = await pool.connect();
    client = dbClient;
    await dbClient.query('BEGIN');

    const updated = await updatePasswordWithCheck(
      dbClient,
      userId,
      passwordHash,
      newPasswordHash,
    );
    if (!updated) {
      await dbClient.query('ROLLBACK');
      const err = new Error('password already updated');
      err.name = 'PasswordAlreadyUpdatedError';
      throw err;
    }

    await revokeRefreshTokens(dbClient, userId);
    await revokeSessions(dbClient, userId);

    await dbClient.query('COMMIT');
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
    }
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }

  handleAccessTokenBlackList(authorizationHeader).catch(() => undefined);

  const resetAt = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const { html, text, subject } = buildPasswordResetEmail({ nickname, resetAt, ip });

  sendEmail({
    to: email,
    subject,
    html,
    text,
  }).catch(() => undefined);

  await writeUserLogToDB(userId, UserLogActionEnum.UPDATE_PASSWORD, {
    detail: '使用者更新密碼成功',
    metadata: {
      name: nickname,
    },
    ipAddress: ip,
    userAgent: userAgent,
  });
};
