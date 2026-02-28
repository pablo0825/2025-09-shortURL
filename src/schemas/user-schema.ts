// user-schema.ts
import { z } from 'zod';

// 這個正規表達式用於檢查字串是否滿足以下三個條件：
// 1. 至少包含一個大寫英文字母 (?=.*[A-Z])
// 2. 至少包含一個小寫英文字母 (?=.*[a-z])
// 3. 至少包含一個數字 (?=.*[0-9])
// 4. 總長度至少為 6 位 (.{6,})
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
const codeRegex = /^\d{6}$/;
const nonceRegex = /^[a-fA-F0-9]{32}$/;
// 開頭09，後面需要8碼
const phoneRegex = /^09\d{8}$/;

// coerce 字串轉數字
export const userIdSchema = z.coerce
    .number()
    .int('userId 必須是整數')
    .positive('userId 必須是正數');

const passwordSchema = z
    .string()
    .regex(passwordRegex, '密碼必須至少包含一個大寫字母、一個小寫字母和一個數字。')
    .min(6);

export const bodySchema = z
    .object({
        currentPassword: passwordSchema,
        newPassword: passwordSchema,
        newPasswordAgain: passwordSchema,
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
        error: '新密碼不能與目前密碼相同',
        // 錯誤會顯示在newPassword欄位
        path: ['newPassword'],
    })
    .refine((data) => data.newPasswordAgain === data.newPassword, {
        // refine 可以把data傳進去，進行條件運算
        error: '兩次輸入的新密碼必須相同',
        path: ['newPasswordAgain'],
    });

export type ChangePasswordBodyDto = z.infer<typeof bodySchema>;

export const codeAndNonceSchema = z.object({
    code: z.string().regex(codeRegex, 'code必須是6碼數字').min(6),
    nonce: z.string().regex(nonceRegex, 'nonce必須是長度為32且a-f, A-F, 0-9的字元').min(32),
});

export type EnableTwofaDto = z.infer<typeof codeAndNonceSchema>;

// coerce.number 強制把字串轉成數字
// .int 驗證值是否為整數
// .positive 驗證值是否為正數
export const logoutTokenIdSchema = z.coerce
    .number()
    .int('tokenId 必須是整數')
    .positive('tokenId 必須是正整數');

export const myProfileSchema = z.object({
    nickname: z.string().min(6, '使用者名稱至少6個字'),
    jobTitle: z.string().min(1, '職稱至少兩個字'),
    unit: z.string().min(1, '單位名稱至少兩個字'),
    phone: z.string().regex(phoneRegex, '手機格式錯誤').min(10),
});

export type MyProfileDto = z.infer<typeof myProfileSchema>;
