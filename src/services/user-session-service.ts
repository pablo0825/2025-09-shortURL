import bcrypt from 'bcrypt';
import {
  findActiveRefreshTokenSessionsByUserId,
  findActiveSessionsByUserId,
  revokeAllSessionsForUser,
  revokeOneSessionForUser,
} from '../repositories/user-session-repository';
import { SessionListItem } from '../types/types';

interface SessionListResult {
  message: string;
  data: SessionListItem[];
}

interface LogoutAllResult {
  count: number;
}

interface LogoutDeviceResult {
  revoked: boolean;
  currentSessionLoggedOut: boolean;
}

export const getMySessionsListService = async (
  userId: number,
  refreshToken: string,
): Promise<SessionListResult> => {
  try {
    const sessions = await findActiveSessionsByUserId(userId);
    if (!sessions.length) {
      return {
        message: '尚無裝置紀錄',
        data: [],
      };
    }

    const refreshTokenSessions = await findActiveRefreshTokenSessionsByUserId(userId);
    if (!refreshTokenSessions.length) {
      return {
        message: '尚無可用的 refresh token',
        data: [],
      };
    }

    let currentSessionId: number | null = null;
    for (const tokenRow of refreshTokenSessions) {
      const matched = await bcrypt.compare(refreshToken, tokenRow.refresh_token_hash);
      if (matched) {
        currentSessionId = tokenRow.session_id;
        break;
      }
    }

    const inactiveMs = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list: SessionListItem[] = sessions.map((sessionRow) => {
      const isExpired = sessionRow.expires_at.getTime() < now;

      let status: 'expired' | 'inactive' | 'active';
      if (isExpired) {
        status = 'expired';
      } else if (!sessionRow.last_seen_at) {
        status = 'inactive';
      } else {
        const lastSeenMs = sessionRow.last_seen_at.getTime();
        status = now - lastSeenMs > inactiveMs ? 'inactive' : 'active';
      }

      return {
        id: sessionRow.id,
        last_seen_at: sessionRow.last_seen_at,
        userAgent: sessionRow.user_agent,
        ip_address: sessionRow.ip_address,
        device_info: sessionRow.device_info,
        status,
        current: currentSessionId !== null && sessionRow.id === currentSessionId,
      };
    });

    return {
      message: `讀取 ${list.length} 個裝置`,
      data: list,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[userSessionService.getMySessionsList] ${msg}`);
  }
};

export const logoutAllService = async (userId: number): Promise<LogoutAllResult> => {
  try {
    const count = await revokeAllSessionsForUser(userId);
    return { count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[userSessionService.logoutAll] ${msg}`);
  }
};

export const logoutDeviceService = async (
  userId: number,
  sessionId: number,
  refreshToken?: string,
): Promise<LogoutDeviceResult> => {
  try {
    const result = await revokeOneSessionForUser(userId, sessionId);
    if (!result.revoked) {
      return {
        revoked: false,
        currentSessionLoggedOut: false,
      };
    }

    let currentSessionLoggedOut = false;
    if (refreshToken && result.tokenHashes.length) {
      for (const tokenHash of result.tokenHashes) {
        const matched = await bcrypt.compare(refreshToken, tokenHash);
        if (matched) {
          currentSessionLoggedOut = true;
          break;
        }
      }
    }

    return {
      revoked: true,
      currentSessionLoggedOut,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[userSessionService.logoutDevice] ${msg}`);
  }
};
