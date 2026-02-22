-- URL Shortener Backend - Database Schema
-- Updated: 2026-02-21

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_task_status') THEN
        CREATE TYPE link_task_status AS ENUM ('pending', 'processing', 'done', 'failed');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_log_action_type') THEN
        CREATE TYPE user_log_action_type AS ENUM (
            'FORGOT_PASSWORD',
            'RESET_PASSWORD',
            'UPDATE_PROFILE',
            'UPDATE_AVATAR',
            'UPDATE_PASSWORD',
            'DELETE_ACCOUNT',
            'LOGIN',
            'LOGOUT',
            'REFRESH_TOKEN',
            'SETUP_2FA',
            'ENABLE_2FA',
            'DISABLE_2FA',
            'DELETE_AVATAR'
        );
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL UNIQUE,
    provider TEXT DEFAULT 'local',
    provider_id TEXT,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    avatar_key TEXT,
    avatar_updated_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ,
    last_password_reset_at TIMESTAMPTZ,
    reset_password_token TEXT,
    reset_password_expires_at TIMESTAMPTZ,
    twofa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    twofa_secret_encrypted BYTEA,
    twofa_secret_iv BYTEA,
    twofa_secret_auth_tag BYTEA,
    twofa_enabled_at TIMESTAMPTZ,
    twofa_backup_codes_version INTEGER NOT NULL DEFAULT 0,
    job_title VARCHAR(100),
    unit VARCHAR(100),
    phone VARCHAR(30),
    CONSTRAINT chk_users_twofa_state_consistency CHECK (
        (
            twofa_enabled = TRUE
            AND twofa_secret_encrypted IS NOT NULL
            AND twofa_secret_iv IS NOT NULL
            AND twofa_secret_auth_tag IS NOT NULL
            AND twofa_enabled_at IS NOT NULL
        )
        OR
        (
            twofa_enabled = FALSE
            AND twofa_secret_encrypted IS NULL
            AND twofa_secret_iv IS NULL
            AND twofa_secret_auth_tag IS NULL
            AND twofa_enabled_at IS NULL
        )
    )
);

CREATE TABLE IF NOT EXISTS session (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    user_agent TEXT,
    ip_address INET,
    device_info TEXT,
    reason TEXT,
    CHECK (expires_at >= created_at)
);

CREATE TABLE IF NOT EXISTS refresh_token (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id BIGINT UNIQUE REFERENCES session(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    device_info TEXT,
    last_used_at TIMESTAMPTZ,
    CHECK (expires_at IS NULL OR expires_at >= created_at)
);

CREATE TABLE IF NOT EXISTS role (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type VARCHAR(20) NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT chk_role_type CHECK (type IN ('admin', 'user', 'assistant'))
);

CREATE TABLE IF NOT EXISTS user_role (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    parent_id BIGINT REFERENCES permissions(id) ON DELETE SET NULL,
    CONSTRAINT uq_permissions_module_type UNIQUE (module, type)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    permissions_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permissions_id)
);

CREATE TABLE IF NOT EXISTS user_backup_codes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    used_at TIMESTAMPTZ,
    used_by_ip INET,
    used_by_user_agent TEXT,
    used_by_session_id BIGINT REFERENCES session(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action user_log_action_type NOT NULL,
    detail TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS links (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(16),
    long_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expire_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    creator_ip INET,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (expire_at >= created_at)
);

CREATE TABLE IF NOT EXISTS link_task (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status link_task_status NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    processed_at TIMESTAMPTZ,
    last_error TEXT,
    last_error_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_payload_has_keys CHECK (
        payload ? 'code' AND payload ? 'long_url' AND payload ? 'expire_at'
    )
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id BIGINT NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT,
    target_display VARCHAR(255),
    request_path TEXT NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    request_ip INET,
    user_agent TEXT,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    diff JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_reset_password_token ON users(reset_password_token);

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_session_expires_at ON session(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_user_revoked ON session(user_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_refresh_token_user_id ON refresh_token(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user_revoked ON refresh_token(user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_refresh_token_session_id ON refresh_token(session_id);

CREATE INDEX IF NOT EXISTS idx_permissions_parent_id ON permissions(parent_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_id ON user_backup_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_version ON user_backup_codes(user_id, version);
CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user_version_unused
    ON user_backup_codes(user_id, version)
    WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_log_user_created_at ON user_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_log_action_user_created_at ON user_log(action, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_links_expire_at ON links(expire_at);
CREATE INDEX IF NOT EXISTS idx_links_active_expire ON links(is_active, expire_at);
CREATE UNIQUE INDEX IF NOT EXISTS links_code_uidx ON links(code) WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_link_task_available ON link_task(status, available_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_link_task_dedup
    ON link_task(link_id)
    WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_time
    ON admin_audit_logs(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_time
    ON admin_audit_logs(target_type, target_id, created_at);

COMMIT;
