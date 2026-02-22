// types.ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface Link {
    id: string;
    code:string;
    long_url:string;
    created_at:Date | string;
    expire_at:Date | string;
    is_active: boolean;
    total_count: string;
}

export interface LinkLog {
    id:number;
    link_id:number;
    log_info:Json;
    created_at:Date | string;
}

export interface SessionListItem {
    id: number;
    last_seen_at: Date | null;
    userAgent: string | null;
    ip_address: string | null;
    device_info: string | null;
    status: "expired" | "inactive" | "active";
    current?: boolean;
}

export interface RoleItem {
    id: number;
    type: string;
}

export interface PermissionTreeNode {
    id: number;
    name: string;
    module: string;
    type: string;
    description: string | null;
    parentId: number | null;
    selected: boolean;   // 角色直接擁有
    inherited: boolean;  // 補父節點而來
    children: PermissionTreeNode[];
}
