export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code?: string;

    constructor(statusCode: number, message: string, code?: string) {
        super(message);
        this.name = code ?? 'AppError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

export const isAppError = (err: unknown): err is AppError => {
    return err instanceof AppError;
};

export const toAppError = (
    context: string,
    err: unknown,
    fallbackStatusCode = 500,
): AppError => {
    if (err instanceof AppError) {
        return new AppError(err.statusCode, `[${context}] ${err.message}`, err.code);
    }

    const message = err instanceof Error ? err.message : String(err);
    return new AppError(fallbackStatusCode, `[${context}] ${message}`);
};
