import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ensureDir, safeJoin } from '../../src/utils/fs-utils';

describe('fs-utils', () => {
    it('should create directory recursively in ensureDir', async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-utils-'));
        const target = path.join(root, 'a', 'b', 'c');

        await ensureDir(target);

        const stat = await fs.stat(target);
        expect(stat.isDirectory()).toBe(true);
    });

    it('should return normalized path when safeJoin path is valid', () => {
        const base = path.join(process.cwd(), 'uploads');
        const result = safeJoin(base, 'avatars', '1', 'a.webp');

        expect(result.startsWith(path.resolve(base))).toBe(true);
    });

    it('should throw when safeJoin attempts path traversal', () => {
        const base = path.join(process.cwd(), 'uploads');

        expect(() => safeJoin(base, '..', 'etc', 'passwd')).toThrow('非法路徑');
    });
});
