-- CREATE TABLE links (
--     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY , -- 主鍵
--     code VARCHAR(16) UNIQUE NOT NULL , -- 短網址，自動建立唯一索引
--     long_url TEXT NOT NULL , -- 長網址
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now() , -- 創建時間
--     expire_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'), -- 7天的到期時間
--     creator_ip INET , -- 創建者ip
--     is_active BOOLEAN NOT NULL DEFAULT TRUE , -- 短網址是否活躍
--     CHECK ( expire_at >= created_at )
-- );
--
-- CREATE TABLE link_logs (
--     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY ,
--     link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE , -- 外鍵 引用自links_id
--     log_info JSONB NOT NULL , -- log資訊
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now() -- 建立時間戳
-- );
--
-- -- 建立索引
-- CREATE INDEX IF NOT EXISTS idx_links_expire_at ON links(expire_at);
-- CREATE INDEX IF NOT EXISTS idx_link_logs_link_id ON link_logs(link_id);
-- CREATE INDEX IF NOT EXISTS idx_link_logs_link_created_at ON link_logs(created_at);


-- ALTER TABLE links ALTER COLUMN code DROP NOT NULL;
-- CREATE UNIQUE INDEX IF NOT EXISTS links_code_uidx ON links(code) WHERE code IS NOT NULL;

-- ALTER TABLE links ADD COLUMN short_url TEXT;

-- ALTER TABLE links DROP COLUMN short_url

-- 2025/11/04 建立link_task
-- CREATE TYPE link_task_status AS ENUM ('pending', 'processing', 'done', 'failed');
-- --
-- CREATE TABLE link_task (
--     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY , -- 主鍵
--     link_id BIGINT NOT NULL REFERENCES links(id) ON DELETE CASCADE , -- 外鍵，引用自link_id
--     payload JSONB NOT NULL DEFAULT '{}'::jsonb, -- 封包，存code, long_url, expire_at等
--     status link_task_status NOT NULL DEFAULT 'pending', -- 任務狀態，預設是pending
--     attempts INTEGER NOT NULL DEFAULT 0, -- 重試次數
--     available_at TIMESTAMPTZ NOT NULL DEFAULT now(), -- 下次可以執行的時間
--     locked_at     TIMESTAMPTZ, -- worker 鎖定時間
--     locked_by     TEXT, -- 被哪個 worker 取用
--     processed_at TIMESTAMPTZ, -- 成功完成時間
--     last_error TEXT, -- 最近一次錯誤的原因
--     last_error_at TIMESTAMPTZ, -- 最近一次錯誤的時間
--     created_at TIMESTAMPTZ NOT NULL DEFAULT now()  -- 創建時間
-- );
-- --
-- -- -- 建立索引
-- -- -- 複合式索引
-- CREATE INDEX IF NOT EXISTS idx_link_task_available ON link_task(status, available_at);
--
-- -- 限制同一個link_id在pending/processing期間，只能保留一筆
-- CREATE UNIQUE INDEX IF NOT EXISTS ux_link_task_dedup ON link_task(link_id) WHERE status IN ('pending','processing');
--
-- -- 限制payload帶的資料，且不能為空
-- ALTER TABLE link_task ADD CONSTRAINT chk_payload_has_keys CHECK (payload ? 'code' AND payload ? 'long_url' AND payload ? 'expire_at');

TRUNCATE TABLE link_task;

UPDATE link_task SET status = $1, available_at = now() + make_interval(secs => LEAST(3600, 60 * (2 ^ GREATEST($2 ,1)))),last_error = $3, last_error_at = now(), locked_at = NULL, locked_by = Null WHERE id = $4 AND status = $5