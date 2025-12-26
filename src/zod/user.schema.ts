// user.schema.ts
import {z} from "zod";

// 這個正規表達式用於檢查字串是否滿足以下三個條件：
// 1. 至少包含一個大寫英文字母 (?=.*[A-Z])
// 2. 至少包含一個小寫英文字母 (?=.*[a-z])
// 3. 至少包含一個數字 (?=.*[0-9])
// 4. 總長度至少為 6 位 (.{6,})
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;

// coerce 字串轉數字
export const userIdSchema = z.coerce.number().int("userId 必須是整數").positive("userId 必須是正數");

const passwordSchema = z.string().regex(passwordRegex, "密碼必須至少包含一個大寫字母、一個小寫字母和一個數字。").min(6);

export const bodySchema = z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
    newPasswordAgain: passwordSchema,
}).refine((data) => data.currentPassword !== data.newPassword, {
    error: "新密碼不能與目前密碼相同",
    // 錯誤會顯示在newPassword欄位
    path: ["newPassword"],
}).refine((data) => data.newPasswordAgain !== data.newPasswordAgain, {
    // refine 可以把data傳進去，進行條件運算
    error: "兩次輸入的新密碼必須相同",
    path: ["newPasswordAgain"],
});