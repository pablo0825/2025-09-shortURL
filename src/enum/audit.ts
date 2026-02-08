export enum AuditTargetType {
    Link = "link",
    User = "user",
    Role = "role",
    Permission = "permission",
    Stats = "stats",
    Log = "log",
}

export enum AuditRequestMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH",
    OPTIONS = "OPTIONS",
    HEAD = "HEAD",
}

export enum AuditStatus {
    Success = "success",
    Failed = "failed",
}
