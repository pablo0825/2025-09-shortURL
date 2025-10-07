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

-- ALTER TABLE links DROP COLUMN short_url;

