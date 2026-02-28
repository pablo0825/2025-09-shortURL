import { describe, expect, it } from 'vitest';
import { bodySchema } from '../../src/schemas/user-schema';

describe('user-schema', () => {
    it('should parse valid change-password payload', () => {
        const result = bodySchema.safeParse({
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
            newPasswordAgain: 'NewPassword1',
        });

        expect(result.success).toBe(true);
    });

    it('should fail when new password matches current password', () => {
        const result = bodySchema.safeParse({
            currentPassword: 'SamePassword1',
            newPassword: 'SamePassword1',
            newPasswordAgain: 'SamePassword1',
        });

        expect(result.success).toBe(false);
    });

    it('should fail when confirm password does not match', () => {
        const result = bodySchema.safeParse({
            currentPassword: 'OldPassword1',
            newPassword: 'NewPassword1',
            newPasswordAgain: 'OtherPassword1',
        });

        expect(result.success).toBe(false);
    });
});
