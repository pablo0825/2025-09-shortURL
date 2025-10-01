// types.ts
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Link = {
    id:number;
    code:string;
    long_url:string;
    created_at:Date | string;
    expire_at:Date | string;
    creator_ip: string | null;
    is_active: boolean;
}

export type LinkLog = {
    id:number;
    link_id:number;
    log_info:Json;
    created_at:Date | string;
};
