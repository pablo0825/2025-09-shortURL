import type { NextFunction, Request, Response, Router } from 'express';

interface InvokeRequest {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
}

interface InvokeResult {
    statusCode: number;
    body: unknown;
    nextError: unknown;
}

interface MutableResponse {
    statusCode: number;
    headersSent: boolean;
    status: (code: number) => MutableResponse;
    json: (payload: unknown) => MutableResponse;
    end: () => MutableResponse;
}

export const invokeRouter = async (router: Router, input: InvokeRequest): Promise<InvokeResult> => {
    return new Promise<InvokeResult>((resolve) => {
        const req = {
            method: input.method,
            url: input.url,
            headers: input.headers ?? {},
            body: input.body,
            ip: '127.0.0.1',
            get(name: string): string | undefined {
                const key = name.toLowerCase();
                const value = (input.headers ?? {})[key];
                return value;
            },
        } as Request;

        const res: MutableResponse = {
            statusCode: 200,
            headersSent: false,
            status(code: number): MutableResponse {
                this.statusCode = code;
                return this;
            },
            json(payload: unknown): MutableResponse {
                this.headersSent = true;
                resolve({
                    statusCode: this.statusCode,
                    body: payload,
                    nextError: null,
                });
                return this;
            },
            end(): MutableResponse {
                this.headersSent = true;
                resolve({
                    statusCode: this.statusCode,
                    body: null,
                    nextError: null,
                });
                return this;
            },
        };

        const done: NextFunction = (err?: unknown): void => {
            resolve({
                statusCode: res.statusCode,
                body: null,
                nextError: err ?? null,
            });
        };

        (
            router as unknown as {
                handle: (req: Request, res: Response, next: NextFunction) => void;
            }
        ).handle(req, res as unknown as Response, done);
    });
};
