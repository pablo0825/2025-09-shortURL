// jwt.schema.ts
import { z } from "zod";

// 檢驗內容
// [注意] 這邊的zod是包裝成物件
export const AccessPayloadSchema = z.object({
    id: z.string().min(1, "id 必填"),
    name: z.string().min(1, "name 必填"),
    email: z.email().min(1, "email 必填"),
    role: z.enum(["admin", "user"]),
});

// 輸出型別
export type AccessPayload = z.infer<typeof AccessPayloadSchema>;

// [注意] 這邊的zod是包裝成字串
export const RefreshPayloadSchema = z.string().min(1, "id 必填");
