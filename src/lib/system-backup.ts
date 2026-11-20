import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const dataRoot = path.join(root, 'data');
const backupsRoot = path.join(dataRoot, 'backups');
const restoresRoot = path.join(dataRoot, 'system-restore');
const excludedData = new Set(['backups', 'logs', 'system-restore', 'app-window-profile']);
const encryptedMagic = Buffer.from('AINB2ENC');
const encryptedHeaderBytes = encryptedMagic.length + 16 + 12;

function backupKey(password: string, salt: Buffer) {
    if (password.length < 8 || password.length > 200) throw new Error('备份密码需要 8 至 200 个字符');
    return scryptSync(password, salt, 32);
}

export async function encryptSystemArchive(archive: string, password: string) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', backupKey(password, salt), iv);
    const encrypted = `${archive}.ainb`;
    try {
        await fs.writeFile(encrypted, Buffer.concat([encryptedMagic, salt, iv]));
        await pipeline(createReadStream(archive), cipher, createWriteStream(encrypted, { flags: 'a' }));
        await fs.appendFile(encrypted, cipher.getAuthTag());
        return { file: encrypted, bytes: (await fs.stat(encrypted)).size };
    } catch (error) {
        await fs.rm(encrypted, { force: true });
        throw error;
    }
}

export async function decryptSystemArchive(encrypted: string, password: string) {
    const output = `${encrypted}.tar.gz`;
    const input = await fs.open(encrypted, 'r');
    try {
        const size = (await input.stat()).size;
        if (size <= encryptedHeaderBytes + 16) throw new Error('加密备份文件不完整');
        const header = Buffer.alloc(encryptedHeaderBytes);
        await input.read(header, 0, header.length, 0);
        if (!header.subarray(0, encryptedMagic.length).equals(encryptedMagic)) throw new Error('请选择本应用创建的加密备份');
        const tag = Buffer.alloc(16);
        await input.read(tag, 0, tag.length, size - tag.length);
        const decipher = createDecipheriv('aes-256-gcm', backupKey(password, header.subarray(8, 24)), header.subarray(24, 36));
        decipher.setAuthTag(tag);
        await pipeline(createReadStream(encrypted, { start: encryptedHeaderBytes, end: size - 17 }), decipher, createWriteStream(output));
        return output;
    } catch (error) {
        await fs.rm(output, { force: true });
        if (error instanceof Error && /authenticate data/.test(error.message)) throw new Error('备份密码错误或文件已损坏');
        throw error;
    } finally { await input.close(); }
}

function tarExecutable() {
    return process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
        : 'tar';
}

async function tar(args: string[]) {
    return execFileAsync(tarExecutable(), args, { maxBuffer: 100 * 1024 * 1024, windowsHide: true });
}

async function exists(file: string) {
    return fs.stat(file).then(() => true).catch(() => false);
}

function safeRestorePath(relative: string) {
    const name = relative.replace(/^\.\//, '').replace(/\/$/, '');
    if (!name || name.includes('\\') || name.includes(':') || name.split('/').some(part => !part || part === '.' || part === '..')) return false;
    return name === 'manifest.json' || name === 'prisma' || name === 'prisma/app.db' ||
        name === '.env' || name === 'config' || name === 'config/app-config.json' ||
        name === 'data' || name === 'public' || name === 'public/uploads' || name === 'public/knowledge-assets' ||
        (name.startsWith('data/') && !excludedData.has(name.split('/')[1])) ||
        name.startsWith('public/uploads/') || name.startsWith('public/knowledge-assets/');
}

function inside(parent: string, child: string) {
    const relative = path.relative(parent, child);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('恢复路径超出应用数据目录');
}

export async function createSystemArchive(prefix = 'system-manual') {
    await fs.mkdir(backupsRoot, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(backupsRoot, `${prefix}-${stamp}.tar.gz`);
    const work = path.join(backupsRoot, 'system-work', randomUUID());
    const snapshot = path.join(work, 'prisma', 'app.db');
    await fs.mkdir(path.dirname(snapshot), { recursive: true });
    try {
        await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshot.replaceAll('\\', '/').replaceAll("'", "''")}'`);
        await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify({
            kind: 'ai-notebook-system-backup', version: 1, createdAt: new Date().toISOString(),
            includes: ['database', 'system-config', 'question-bank', 'recommendation-history', 'wrong-notebooks', 'photos', 'learning-data'],
            excludes: ['previous-backups', 'logs', 'browser-session', 'codex-login-token'],
        }));
        const args = ['-czf', file,
            '--exclude=data/backups', '--exclude=data/logs', '--exclude=data/system-restore',
            '--exclude=data/app-window-profile', '--exclude=data/knowledge-library/sync.lock',
            '-C', work, 'manifest.json', 'prisma/app.db', '-C', root];
        for (const relative of ['.env', 'config/app-config.json', 'data', 'public/uploads', 'public/knowledge-assets']) {
            if (await exists(path.join(root, relative))) args.push(relative);
        }
        await tar(args);
        return { file, bytes: (await fs.stat(file)).size };
    } catch (error) {
        await fs.rm(file, { force: true }).catch(() => {});
        throw error;
    } finally {
        await fs.rm(work, { recursive: true, force: true });
    }
}

export async function inspectSystemArchive(archive: string) {
    const { stdout: names } = await tar(['-tzf', archive]);
    const entries = names.split(/\r?\n/).filter(Boolean);
    if (!entries.length || entries.length > 100_000 || entries.some(name => !safeRestorePath(name))) throw new Error('备份包含不允许的文件路径');
    const { stdout: details } = await tar(['-tvzf', archive]);
    if (details.split(/\r?\n/).filter(Boolean).some(line => !['-', 'd'].includes(line[0]))) throw new Error('备份包含不允许的链接或特殊文件');
    const token = randomUUID();
    const folder = path.join(restoresRoot, token);
    const extracted = path.join(folder, 'extracted');
    await fs.mkdir(extracted, { recursive: true });
    try {
        await tar(['-xzf', archive, '-C', extracted]);
        const manifest = JSON.parse(await fs.readFile(path.join(extracted, 'manifest.json'), 'utf8'));
        if (manifest.kind !== 'ai-notebook-system-backup' || manifest.version !== 1) throw new Error('备份格式或版本不匹配');
        const database = path.join(extracted, 'prisma', 'app.db');
        // Run SQLite inspection in the bundled Node executable. Turbopack cannot
        // externalize node:sqlite into a Next app-route bundle on Windows.
        const query = "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1], { readOnly: true }); try { const ok = db.prepare('PRAGMA integrity_check').get().integrity_check; const users = db.prepare('SELECT COUNT(*) AS count FROM User').get().count; process.stdout.write(JSON.stringify({ok, users})); } finally { db.close(); }";
        const { stdout } = await execFileAsync(process.execPath, ['-e', query, database], { windowsHide: true });
        const inspected = JSON.parse(stdout) as { ok: string; users: number };
        if (inspected.ok !== 'ok') throw new Error('数据库完整性校验失败');
        const users = Number(inspected.users);
        for (const relative of ['config/app-config.json', '.env']) {
            if (relative.endsWith('.json') && await exists(path.join(extracted, relative))) JSON.parse(await fs.readFile(path.join(extracted, relative), 'utf8'));
        }
        // The extracted tree may contain only ordinary files and directories.
        async function checkTree(dir: string): Promise<void> {
            for (const item of await fs.readdir(dir, { withFileTypes: true })) {
                const full = path.join(dir, item.name);
                if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) throw new Error('备份包含不允许的文件类型');
                if (item.isDirectory()) await checkTree(full);
            }
        }
        await checkTree(extracted);
        return { token, folder, extracted, files: entries.filter(name => !name.endsWith('/')).length, users, createdAt: manifest.createdAt as string };
    } catch (error) {
        await fs.rm(folder, { recursive: true, force: true });
        throw error;
    }
}

export async function restoreSystemArchive(token: string) {
    if (!/^[a-f0-9-]{36}$/.test(token)) throw new Error('恢复令牌无效');
    const folder = path.join(restoresRoot, token);
    const extracted = path.join(folder, 'extracted');
    inside(restoresRoot, folder);
    if (!(await exists(path.join(extracted, 'manifest.json')))) throw new Error('备份尚未完成校验');
    await prisma.$disconnect();
    // The caller creates a pre-restore archive before this function is invoked.
    for (const relative of ['public/uploads', 'public/knowledge-assets']) {
        const target = path.join(root, relative);
        inside(root, target);
        await fs.rm(target, { recursive: true, force: true });
        if (await exists(path.join(extracted, relative))) await fs.cp(path.join(extracted, relative), target, { recursive: true });
    }
    const restoredData = path.join(extracted, 'data');
    for (const item of await fs.readdir(dataRoot, { withFileTypes: true }).catch(() => [])) {
        if (excludedData.has(item.name)) continue;
        const target = path.join(dataRoot, item.name);
        inside(dataRoot, target);
        await fs.rm(target, { recursive: true, force: true });
    }
    if (await exists(restoredData)) {
        for (const item of await fs.readdir(restoredData)) await fs.cp(path.join(restoredData, item), path.join(dataRoot, item), { recursive: true });
    }
    for (const relative of ['config/app-config.json', '.env']) {
        const source = path.join(extracted, relative);
        if (await exists(source)) {
            const target = path.join(root, relative);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.copyFile(source, target);
        }
    }
    for (const suffix of ['-wal', '-shm']) await fs.rm(path.join(root, 'prisma', `app.db${suffix}`), { force: true });
    await fs.copyFile(path.join(extracted, 'prisma', 'app.db'), path.join(root, 'prisma', 'app.db'));
    await fs.rm(folder, { recursive: true, force: true });
}
