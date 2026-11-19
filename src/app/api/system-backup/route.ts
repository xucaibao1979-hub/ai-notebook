import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSystemArchive, inspectSystemArchive, restoreSystemArchive } from '@/lib/system-backup';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gunzipSync, gzipSync } from 'node:zlib';

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
        const configDate = new URL(req.url).searchParams.get('configDate');
        if (configDate) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(configDate)) return NextResponse.json({ message: '备份日期无效' }, { status: 400 });
            const file = path.resolve('data/backups', configDate, 'system-config.json.gz');
            const bytes = await fs.readFile(file);
            return new NextResponse(bytes, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="system-config-${configDate}.json.gz"`, 'Cache-Control': 'no-store' } });
        }
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
        const { file, bytes } = await createSystemArchive();
        return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
            headers: {
                'Content-Type': 'application/gzip',
                'Content-Length': String(bytes),
                'Content-Disposition': `attachment; filename="${path.basename(file)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : '系统备份失败' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    if (!await admin()) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    if (!req.body) return NextResponse.json({ message: '请选择完整系统备份文件' }, { status: 400 });
    const folder = path.resolve('data/system-restore');
    await fs.mkdir(folder, { recursive: true });
    const upload = path.join(folder, `upload-${randomUUID()}.tar.gz`);
    try {
        let bytes = 0;
        const meter = new Transform({ transform(chunk, _encoding, callback) {
            bytes += chunk.length;
            if (bytes > 10 * 1024 * 1024 * 1024) callback(new Error('备份文件超过 10 GB 上限'));
            else callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(req.body as never), meter, createWriteStream(upload));
        const result = await inspectSystemArchive(upload);
        return NextResponse.json({ token: result.token, files: result.files, users: result.users, createdAt: result.createdAt, bytes });
    } catch (error) {
        return NextResponse.json({ message: error instanceof Error ? error.message : '系统备份校验失败' }, { status: 400 });
    } finally {
        await fs.rm(upload, { force: true });
    }
}

export async function POST(req: Request) {
    if (!await admin()) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    try {
        const body = await req.json() as { action?: string; token?: string; date?: string };
        if (body.action === 'restore-config') {
            if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('备份日期无效');
            const file = path.resolve('data/backups', body.date, 'system-config.json.gz');
            const backup = JSON.parse(gunzipSync(await fs.readFile(file)).toString('utf8')) as { kind: string; version: number; files: Record<string, string>; createdAt: string; sha256: string };
            const { sha256, ...payload } = backup;
            if (backup.kind !== 'system-config-backup' || backup.version !== 1 || createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== sha256) throw new Error('配置备份校验失败');
            if (Object.keys(backup.files).some(name => !['.env', 'config/app-config.json'].includes(name))) throw new Error('配置备份包含非法路径');
            const safetyDir = path.resolve('data/backups/before-config-restore');
            await fs.mkdir(safetyDir, { recursive: true });
            const current: Record<string, string> = {};
            for (const relative of ['.env', 'config/app-config.json']) {
                const bytes = await fs.readFile(path.resolve(relative)).catch(() => null);
                if (bytes) current[relative] = bytes.toString('base64');
            }
            await fs.writeFile(path.join(safetyDir, `${Date.now()}.json.gz`), gzipSync(JSON.stringify({ files: current })));
            for (const [relative, encoded] of Object.entries(backup.files)) {
                const target = path.resolve(relative);
                await fs.mkdir(path.dirname(target), { recursive: true });
                await fs.writeFile(target, Buffer.from(encoded, 'base64'));
            }
            setTimeout(() => process.exit(0), 1500).unref();
            return NextResponse.json({ success: true, restartRequired: true });
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
