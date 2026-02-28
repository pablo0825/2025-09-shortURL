import { z } from 'zod';

const coerceTrueStringToBoolean = () =>
    z.preprocess((value) => value === 'true', z.boolean().default(false));

export const listLinksQuerySchema = z.object({
    page: z.coerce.number().int('page 必須是整數').min(1, 'page 必須大於 0').default(1),
    pageSize: z.coerce
        .number()
        .int('pageSize 必須是整數')
        .min(1, 'pageSize 必須大於 0')
        .max(200, 'pageSize 不能超過 200')
        .default(30),
    includeExpired: coerceTrueStringToBoolean(),
    includeInactive: coerceTrueStringToBoolean(),
});

export type ListLinksQueryDto = z.infer<typeof listLinksQuerySchema>;

export const linkIdParamSchema = z.string().trim().regex(/^\d+$/, 'id 必須是正整數');

export type LinkIdParamDto = z.infer<typeof linkIdParamSchema>;
