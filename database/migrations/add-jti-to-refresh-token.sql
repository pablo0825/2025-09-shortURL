-- Migration: Add jti column to refresh_token table
-- Purpose: Enable O(1) refresh token lookup by JWT ID instead of O(n) bcrypt scan
-- Note: Existing tokens will have jti = NULL and will be invalidated after deployment.
--       Users will need to re-login once after this migration is applied.
-- Backward compatibility: Column is nullable to avoid breaking existing rows.

ALTER TABLE refresh_token ADD COLUMN IF NOT EXISTS jti TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token_jti
    ON refresh_token(jti)
    WHERE jti IS NOT NULL;
