import type { FileTypeResult } from 'file-type';


declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                role: string;
            };
            avatarFileType?: FileTypeResult;
        }
    }
}

export {};
