import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSystemArchive, decryptSystemArchive, encryptSystemArchive, inspectSystemArchive, restoreSystemArchive } from '@/lib/system-backup';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 3600;

async function admin() {
    const session = await getServerSession(authOptions);
    return session?.user?.role === 'admin';
}

export async function GET(req: Request) {
    if (!await admin()) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    try {
        if (new URL(req.url).searchParams.get('status') === '1') {
            const folder = path.resolve('data/backups');
            const dates = (await fs.readdir(folder).catch(() => [])).filter(name => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse();
            const configBackups = [];
            for (const date of dates.slice(0, 30)) {
                const file = path.join(folder, date, 'system-config.json.gz');
                if (await fs.stat(file).catch(() => null)) configBackups.push({ date, bytes: (await fs.stat(file)).size });
            }
            return NextResponse.json({ configBackups });
        }
        return NextResponse.json({ message: '请使用创建加密备份功能' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : '系统备份失败' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    if (!await admin()) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    if (!req.body) return NextResponse.json({ message: '请选择完整系统备份文件' }, { status: 400 });
    const password = req.headers.get('x-backup-password') || '';
    if (password.length < 8 || password.length > 200) return NextResponse.json({ message: '请输入 8 至 200 个字符的备份密码' }, { status: 400 });
    const folder = path.resolve('data/system-restore');
    await fs.mkdir(folder, { recursive: true });
    const upload = path.join(folder, `upload-${randomUUID()}.ainb`);
    let decrypted = '';
    try {
        let bytes = 0;
        const meter = new Transform({ transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > 10 * 1024 * 1024 * 1024) callback(new Error('备份文件超过 10 GB 上限'));
            else callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(req.body as never), meter, createWriteStream(upload));
        decrypted = await decryptSystemArchive(upload, password);
        const result = await inspectSystemArchive(decrypted);
        return NextResponse.json({ token: result.token, files: result.files, users: result.users, createdAt: result.createdAt, bytes });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : '系统备份校验失败' }, { status: 400 });
    } finally {
        await fs.rm(upload, { force: true });
        if (decrypted) await fs.rm(decrypted, { force: true });
    }
}

export async function POST(req: Request) {
    if (!await admin()) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    try {
        const body = await req.json() as { action?: string; token?: string; password?: string };
        if (body.action === 'export') {
            if (!body.password || body.password.length < 8 || body.password.length > 200) throw new Error('备份密码需要 8 至 200 个字符');
            const archive = await createSystemArchive();
            let encrypted;
            try { encrypted = await encryptSystemArchive(archive.file, body.password || ''); }
            finally { await fs.rm(archive.file, { force: true }); }
            const stream = createReadStream(encrypted.file);
            stream.on('close', () => { void fs.rm(encrypted.file, { force: true }); });
            return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(encrypted.bytes),
                    'Content-Disposition': `attachment; filename="ai-notebook-${new Date().toISOString().slice(0, 10)}.ainb"`,
                    'Cache-Control': 'no-store',
                },
            });
        }
        if (body.action !== 'restore' || !body.token) return NextResponse.json({ message: '请先选择并校验备份' }, { status: 400 });
        const safety = await createSystemArchive('before-system-restore');
        await restoreSystemArchive(body.token);
        setTimeout(() => process.exit(0), 1500).unref();
        return NextResponse.json({ success: true, safetyBackup: path.basename(safety.file), restartRequired: true });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : '系统恢复失败' }, { status: 400 });
    }
}
