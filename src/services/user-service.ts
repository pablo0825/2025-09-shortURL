import { UserLogActionEnum } from '../enum/user-log-action-enum';
import { writeUserLogToDB } from '../utils/write-user-log-to-db';
import {
  findProfileByUserId,
  updateProfileByUserId,
} from '../repositories/user-repository';

interface UpdateProfileInput {
  nickname: string;
  unit: string;
  phone: string;
  jobTitle: string;
}

interface UserContext {
  userId: number;
  ip: string | null;
  userAgent: string | null;
}

export const getMyProfileService = async (userId: number) => {
  try {
    const profile = await findProfileByUserId(userId);
    if (!profile) {
      throw new Error('使用者資料不存在|404');
    }

    return profile;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[userService.getMyProfile] ${msg}`);
  }
};

export const updateMyProfileService = async (
  context: UserContext,
  input: UpdateProfileInput,
) => {
  try {
    const updated = await updateProfileByUserId(context.userId, input);
    if (!updated) {
      throw new Error('使用者資料不存在|404');
    }

    await writeUserLogToDB(context.userId, UserLogActionEnum.UPDATE_PROFILE, {
      detail: '使用者資料更新成功',
      metadata: {
        nickname: updated.nickname,
        unit: updated.unit,
        phone: updated.phone,
        jobTitle: updated.job_title,
      },
      ipAddress: context.ip,
      userAgent: context.userAgent,
    });

    return updated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[userService.updateMyProfile] ${msg}`);
  }
};
