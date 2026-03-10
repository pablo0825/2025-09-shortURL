import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';

interface CreatedLinkRow {
    id: string;
    long_url: string;
    expire_at: string | null;
}

interface LinkCodeRow {
    code: string;
}

interface RedirectLinkRow {
    id: string;
    long_url: string;
    expire_at: string;
}

interface LinkListRow {
    id: string;
    code: string;
    long_url: string;
    created_at: Date | string;
    expire_at: Date | string;
    is_active: boolean;
    total_count: string;
}

interface LinkStateRow {
  is_active: boolean;
  expire_at: string;
}

export interface CreateLinkResult {
    id: string;
    code: string;
    longUrl: string;
    expireAt: string | null;
}

export interface ListLinksResult {
    rows: LinkListRow[];
    total: number;
}

const MIN_LENGTH = 5;
const OFFSET = BigInt(62 ** (MIN_LENGTH - 1));
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const encodeBase62 = (input: bigint): string => {
    if (input === 0n) {
        return ALPHABET[0];
    }

    let n = input;
    const chars: string[] = [];
    const base = BigInt(ALPHABET.length);

    while (n > 0n) {
        const remainder = Number(n % base);
        chars.push(ALPHABET[remainder]);
        n /= base;
    }

    return chars.reverse().join('');
};

export const createLinkRecord = async (
    longUrl: string,
    creatorIp: string | null,
): Promise<CreateLinkResult> => {
    let client: PoolClient | undefined;

    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const created = await client.query<CreatedLinkRow>(
            'INSERT INTO links (long_url, creator_ip) VALUES ($1, $2::INET) RETURNING id::text, long_url, expire_at',
            [longUrl, creatorIp],
        );

        const id = created.rows[0]?.id;
        if (!id) {
            throw new Error('建立 link 失敗，未取得 id');
        }

        const code = encodeBase62(BigInt(id) + OFFSET);
        const updated = await client.query<LinkCodeRow>(
            'UPDATE links SET code = $1 WHERE id = $2::BIGINT RETURNING code',
            [code, id],
        );
        const savedCode = updated.rows[0]?.code;
        if (!savedCode) {
            throw new Error('建立 link 失敗，未取得 short code');
        }

        const payload = {
            code: savedCode,
            long_url: created.rows[0].long_url,
            expire_at: created.rows[0].expire_at,
        };
        await client.query(
            'INSERT INTO link_task (link_id, payload, available_at) VALUES ($1::BIGINT, $2::jsonb, now())',
            [id, payload],
        );

        await client.query('COMMIT');

        return {
            id,
            code: savedCode,
            longUrl: created.rows[0].long_url,
            expireAt: created.rows[0].expire_at,
        };
    } catch (err) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback failure
            }
        }
        throw err;
    } finally {
        if (client) {
            client.release();
        }
    }
};

export const findLinkByShortCode = async (code: string): Promise<RedirectLinkRow | null> => {
    const result = await pool.query<RedirectLinkRow>(
        'SELECT id::text, long_url, expire_at FROM links WHERE code = $1 AND is_active = TRUE AND expire_at > now() LIMIT 1',
        [code],
    );

    return result.rowCount ? result.rows[0] : null;
};

export const listLinks = async (
    pageSize: number,
    offset: number,
    includeExpired: boolean,
    includeInactive: boolean,
): Promise<ListLinksResult> => {
    const result = await pool.query<LinkListRow>(
        `SELECT id::text, code, long_url, created_at, expire_at, is_active, COUNT(*) OVER() AS total_count
     FROM links
     WHERE ($3::boolean OR expire_at > now())
       AND ($4::boolean OR is_active = TRUE)
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
        [pageSize, offset, includeExpired, includeInactive],
    );

    const total = result.rowCount ? Number(result.rows[0].total_count) : 0;
    return {
        rows: result.rows,
        total,
    };
};

export const deleteLinkById = async (id: string): Promise<string | null> => {
    const result = await pool.query<LinkCodeRow>(
        'DELETE FROM links WHERE id = $1::BIGINT RETURNING code',
        [id],
    );
    return result.rowCount ? result.rows[0].code : null;
};

export const deactivateLinkById = async (id: string): Promise<string | null> => {
    const result = await pool.query<LinkCodeRow>(
        'UPDATE links SET is_active = FALSE WHERE id = $1::BIGINT AND expire_at > now() AND is_active = TRUE RETURNING code',
        [id],
    );
    return result.rowCount ? result.rows[0].code : null;
};

export const findLinkStateById = async (id: string): Promise<LinkStateRow | null> => {
  const result = await pool.query<LinkStateRow>(
    'SELECT is_active, expire_at FROM links WHERE id = $1::BIGINT LIMIT 1',
    [id],
  );
  return result.rowCount ? result.rows[0] : null;
};

