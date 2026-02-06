// admin.schema.ts
import {number, z} from "zod";

// coerce 字串轉數字
export const userIdSchema = z.coerce.number().int("userId 必須是整數").positive("userId 必須是正數");

export const usersListSchema = z.object({
    // 頁數&筆數限制
    page:z.coerce.number().int("page 必須是整數").min(1).default(1),
    limit:z.coerce.number().int("limit 必須是整數").min(1).max(200).default(20),
    // 分類&排序
    sortBy: z.enum(["created_at", "last_login_at", "email", "nickname"]).default("created_at"), // 按照哪個欄位排序
    sortOrder: z.enum(["asc", "desc"]).default("desc"),// asc=由小到大, desc=由大到小
    // 篩選條件
    includeInactive:z.coerce.boolean().default(false),
    // .optional() 可以不傳參數
    role: z.enum(["admin", "assistant", "user"]).optional(),
    twofa_enabled: z.coerce.boolean().optional(),
    q: z.string().trim().min(1).optional() // 模糊搜尋
});