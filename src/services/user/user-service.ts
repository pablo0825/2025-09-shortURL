import { UserLogActionEnum } from '../../enum/user-log-action-enum';
import type { MyProfileDto } from '../../schemas/user-schema';
import { recordUserLogService } from './user-log-service';
import { AppError, toAppError } from '../../utils/app-error';
import { findProfileByUserId, updateProfileByUserId } from '../../repositories/user/user-repository';

interface UserContext {
    userId: number;
    ip: string | null;
    userAgent: string | null;
}

export const getMyProfileService = async (userId: number) => {
    try {
        const profile = await findProfileByUserId(userId);

        // 檢查 profile === null
        if (!profile) {
            throw new AppError(404, '使用者資料不存在');
        }

        return profile;
    } catch (err) {
        throw toAppError('userService.getMyProfile', err);
    }
};

export const updateMyProfileService = async (context: UserContext, input: MyProfileDto) => {
    try {
        const updated = await updateProfileByUserId(context.userId, input);

        if (!updated) {
            throw new AppError(404, '使用者資料不存在');
        }

        await recordUserLogService(context.userId, UserLogActionEnum.UPDATE_PROFILE, {
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
        throw toAppError('userService.updateMyProfile', err);
    }
};
