import { pool } from '../../db/pool';

interface AdminLinksFilterResult {
    whereSql: string;
    values: Array<string>;
    nextIndex: number;
}

type NullableFieldFilter = 'is_null' | 'is_not_null' | 'ignore';
type ExpireFieldFilter = 'gt_now' | 'lte_now' | 'ignore';

export interface AdminLinksStatusFilter {
    deletedAt: NullableFieldFilter;
    isActive: boolean | 'ignore';
    expireAt: ExpireFieldFilter;
}

export interface ListAdminLinksQuery {
    page: number;
    limit: number;
    sortBy: 'created_at' | 'updated_at' | 'expire_at' | 'click_count' | 'last_clicked_at';
    sortOrder: 'asc' | 'desc';
    q?: string;
    statusFilter: AdminLinksStatusFilter;
}

export interface AdminLinkListRow {
    id: number;
    code: string | null;
    long_url: string;
    created_at: string;
    updated_at: string;
    expire_at: string;
    deleted_at: string | null;
    click_count: string;
    last_clicked_at: string | null;
    is_active: boolean;
    creator_user_id: number | null;
    creator_email: string | null;
}

export interface ListAdminLinksRepositoryResult {
    rows: AdminLinkListRow[];
    total: number;
}

const buildWhereClause = (input: ListAdminLinksQuery): AdminLinksFilterResult => {
    const filters: string[] = [];
    const values: Array<string> = [];
    let nextIndex = 1;

    if (input.q) {
        values.push(`%${input.q}%`);
        filters.push(
            `(l.code ILIKE $${nextIndex} OR l.long_url ILIKE $${nextIndex} OR u.email ILIKE $${nextIndex})`,
        );
        nextIndex += 1;
    }

    if (input.statusFilter.deletedAt === 'is_null') {
        filters.push('l.deleted_at IS NULL');
    } else if (input.statusFilter.deletedAt === 'is_not_null') {
        filters.push('l.deleted_at IS NOT NULL');
    }

    if (input.statusFilter.isActive !== 'ignore') {
        const isActiveValue = input.statusFilter.isActive ? 'TRUE' : 'FALSE';
        filters.push(`l.is_active = ${isActiveValue}`);
    }

    if (input.statusFilter.expireAt === 'gt_now') {
        filters.push('l.expire_at > now()');
    } else if (input.statusFilter.expireAt === 'lte_now') {
        filters.push('l.expire_at <= now()');
    }

    if (!filters.length) {
        return {
            whereSql: '',
            values,
            nextIndex,
        };
    }

    return {
        whereSql: `WHERE ${filters.join(' AND ')}`,
        values,
        nextIndex,
    };
};

const mapSortByToColumn = (sortBy: ListAdminLinksQuery['sortBy']): string => {
    if (sortBy === 'created_at') {
        return 'l.created_at';
    }

    if (sortBy === 'updated_at') {
        return 'l.updated_at';
    }

    if (sortBy === 'expire_at') {
        return 'l.expire_at';
    }

    if (sortBy === 'click_count') {
        return 'l.click_count';
    }

    return 'l.last_clicked_at';
};

export const listAdminLinks = async (
    input: ListAdminLinksQuery,
): Promise<ListAdminLinksRepositoryResult> => {
    const { whereSql, values, nextIndex } = buildWhereClause(input);
    const sortByColumn = mapSortByToColumn(input.sortBy);
    const sortOrder = input.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const offset = (input.page - 1) * input.limit;

    const limitIndex = nextIndex;
    const offsetIndex = nextIndex + 1;

    const listSql = `
        SELECT
            l.id::BIGINT AS id,
            l.code,
            l.long_url,
            l.created_at::TEXT AS created_at,
            l.updated_at::TEXT AS updated_at,
            l.expire_at::TEXT AS expire_at,
            l.deleted_at::TEXT AS deleted_at,
            l.click_count::TEXT AS click_count,
            l.last_clicked_at::TEXT AS last_clicked_at,
            l.is_active,
            l.creator_user_id::BIGINT AS creator_user_id,
            u.email AS creator_email
        FROM links l
        LEFT JOIN users u ON u.id = l.creator_user_id
        ${whereSql}
        ORDER BY ${sortByColumn} ${sortOrder}, l.id DESC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
    `;

    const countSql = `
        SELECT COUNT(*)::TEXT AS total
        FROM links l
        LEFT JOIN users u ON u.id = l.creator_user_id
        ${whereSql}
    `;

    const listValues = [...values, String(input.limit), String(offset)];
    const [listResult, countResult] = await Promise.all([
        pool.query<AdminLinkListRow>(listSql, listValues),
        pool.query<{ total: string }>(countSql, values),
    ]);

    return {
        rows: listResult.rows,
        total: Number(countResult.rows[0]?.total ?? '0'),
    };
};
