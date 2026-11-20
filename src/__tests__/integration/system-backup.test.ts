import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const mock = vi.hoisted(() => ({ snapshot: vi.fn(), disconnect: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { $executeRawUnsafe: mock.snapshot, $disconnect: mock.disconnect } }));

let temporary = '';
afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    temporary = '';
});

it('archives and restores the database, configuration, question bank and images', async () => {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-notebook-system-backup-'));
    const database = path.join(temporary, 'prisma', 'app.db');
    await fs.mkdir(path.dirname(database), { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const sqlite = new DatabaseSync(database);
    sqlite.exec('CREATE TABLE User (id TEXT PRIMARY KEY); INSERT INTO User VALUES (\'admin\');');
    sqlite.close();
    await fs.mkdir(path.join(temporary, 'config'), { recursive: true });
    await fs.writeFile(path.join(temporary, 'config', 'app-config.json'), '{"aiProvider":"openai"}');
    await fs.writeFile(path.join(temporary, '.env'), 'NEXTAUTH_SECRET=test');
    await fs.mkdir(path.join(temporary, 'data', 'knowledge-library'), { recursive: true });
    await fs.writeFile(path.join(temporary, 'data', 'knowledge-library', 'history.json'), '{"items":1}');
    await fs.mkdir(path.join(temporary, 'public', 'uploads'), { recursive: true });
    await fs.writeFile(path.join(temporary, 'public', 'uploads', 'homework.png'), 'photo');
    mock.snapshot.mockImplementation(async (sql: string) => {
        const target = sql.match(/^VACUUM INTO '(.+)'$/)?.[1];
        if (!target) throw new Error('Missing snapshot path');
        await fs.copyFile(database, target);
    });
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(temporary);
    const { createSystemArchive, encryptSystemArchive, decryptSystemArchive, inspectSystemArchive, restoreSystemArchive } = await import('@/lib/system-backup');
    cwd.mockRestore();

    const archive = await createSystemArchive();
    const encrypted = await encryptSystemArchive(archive.file, 'correct horse battery');
    await expect(decryptSystemArchive(encrypted.file, 'wrong-password')).rejects.toThrow('备份密码错误');
    const decrypted = await decryptSystemArchive(encrypted.file, 'correct horse battery');
    const inspected = await inspectSystemArchive(decrypted);
    expect(inspected.users).toBe(1);
    expect(inspected.files).toBeGreaterThan(4);
    await fs.writeFile(path.join(temporary, 'config', 'app-config.json'), '{"aiProvider":"gemini"}');
    await fs.writeFile(path.join(temporary, 'data', 'knowledge-library', 'history.json'), '{"items":0}');
    await fs.writeFile(path.join(temporary, 'public', 'uploads', 'homework.png'), 'changed');
    await restoreSystemArchive(inspected.token);
    expect(JSON.parse(await fs.readFile(path.join(temporary, 'config', 'app-config.json'), 'utf8')).aiProvider).toBe('openai');
    expect(await fs.readFile(path.join(temporary, 'data', 'knowledge-library', 'history.json'), 'utf8')).toBe('{"items":1}');
    expect(await fs.readFile(path.join(temporary, 'public', 'uploads', 'homework.png'), 'utf8')).toBe('photo');
    expect(mock.disconnect).toHaveBeenCalledOnce();
});
