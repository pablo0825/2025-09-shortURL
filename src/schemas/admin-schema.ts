// admin-schema.ts
import {number, z} from "zod";

// coerce 字串轉數字
export const userIdSchema = z.coerce.number().int("userId 必須是整數").positive("userId 必須是正數");

export const userRoleIdSchema = z.coerce.number().int("roleId 必須是整數").positive("roleId 必須是正數");

export const userRoleSchema = z.enum(["admin", "assistant"])

// .preprocess 在正式驗證前，先做一次預處理
const queryBooleanSchema = z.preprocess((v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "true") return true;
        if (s === "false") return false;
    }
    return v;
}, z.boolean());

export const usersListSchema = z.object({
    // 頁數&筆數限制
    page:z.coerce.number().int("page 必須是整數").min(1).default(1),
    limit:z.coerce.number().int("limit 必須是整數").min(1).max(200).default(20),
    // 分類&排序
    sortBy: z.enum(["created_at", "last_login_at", "email", "nickname"]).default("created_at"), // 按照哪個欄位排序
    sortOrder: z.enum(["asc", "desc"]).default("desc"),// asc=由小到大, desc=由大到小
    // 篩選條件
    includeInactive:queryBooleanSchema.default(false),
    // .optional() 可以不傳參數
    role: z.enum(["admin", "assistant", "user"]).optional(),
    twofa_enabled: queryBooleanSchema.optional(),
    q: z.string().trim().min(1).optional() // 模糊搜尋
});

const roleItemSchema = z.object({
    id: z.number().int().positive(),
    type: z.string().min(1),
});

export const roleItemArraySchema = z.array(roleItemSchema);

const permissionItemSchema = z.object({
    module: z.string().trim().min(1).max(100),
    type: z.string().trim().min(1).max(100),
});

export const replaceRolePermissionsSchema = z.object({
    permissions: z
            .array(permissionItemSchema)
            .max(1000)
            .transform((arr) => {
                // 以 module|type 當 composite key 去重
                return Array.from(
                        new Map(arr.map((p) => [`${p.module}|${p.type}`, p])).values()
                );
            }),
    reason: z.string().trim().max(200).optional(),
    version: z.number().int().nonnegative().optional(),
});