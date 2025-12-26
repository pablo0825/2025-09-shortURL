// auth.schema.ts
import {z} from "zod";

// 這個正規表達式用於檢查字串是否滿足以下三個條件：
// 1. 至少包含一個大寫英文字母 (?=.*[A-Z])
// 2. 至少包含一個小寫英文字母 (?=.*[a-z])
// 3. 至少包含一個數字 (?=.*[0-9])
// 4. 總長度至少為 6 位 (.{6,})
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

export const registerSchema = z.object({
    email: z.email(),
    password: z.string().regex(passwordRegex, "密碼必須至少包含一個大寫字母、一個小寫字母和一個數字。").min(6),
    nickname: z.string().min(6, "使用者名稱至少6個字")
});

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().regex(passwordRegex, "密碼必須至少包含一個大寫字母、一個小寫字母和一個數字。").min(6)
});

// coerce.number 強制把字串轉成數字
// .int 驗證值是否為整數
// .positive 驗證值是否為正數
export const logoutTokenIdSchema = z.coerce.number().int("tokenId 必須是整數").positive("tokenId 必須是正整數");

export const emailSchema = z.email();

export const restPasswordSchema = z.object({
    resetToken: z.string()
            .length(64, { error: "rest token 長度必須是 64 個字元"})
            .regex(/^[0-9a-fA-F]{64}$/, { error: "rest token 格式不正確，必須是十六進位字串" }),
    newPassword: z.string().regex(passwordRegex, "密碼必須至少包含一個大寫字母、一個小寫字母和一個數字。").min(6)
});