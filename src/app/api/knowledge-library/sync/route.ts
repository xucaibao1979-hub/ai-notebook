import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const directory = path.join(process.cwd(), 'data', 'knowledge-library');
const statusPath = path.join(directory, 'sync-status.json');
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        return NextResponse.json({ ...status, errors: status.errors?.slice(-10).map((item: { url: string; message: string }) => ({ ...item, message: item.message.includes('ENOENT') ? '该页面未取得可解析的原始正文，来源仅提供附件或内容不完整，待补充。' : item.message })) });
    } catch { return NextResponse.json({ state: 'idle', discovered: 0, processed: 0, imported: 0, failed: 0 }); }
}
export async function POST() {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    if (fs.existsSync(path.join(directory, 'sync.lock'))) return NextResponse.json({ message: '已有抓取任务正在进行' }, { status: 409 });
    try { if (JSON.parse(fs.readFileSync(statusPath, 'utf8')).state === 'running') return NextResponse.json({ message: '已有抓取任务正在进行' }, { status: 409 }); } catch { /* No prior status. */ }
    const script = path.join(process.cwd(), 'scripts', 'sync-knowledge-library.ts');
    const runner = path.join(process.cwd(), 'node_modules', 'ts-node', 'dist', 'bin.js');
    if (!fs.existsSync(script) || !fs.existsSync(runner)) return NextResponse.json({ message: '当前部署不包含抓取工具，请在源码目录运行抓取命令' }, { status: 422 });
    fs.mkdirSync(directory, { recursive: true });
    const log = fs.openSync(path.join(directory, 'sync.log'), 'a');
    try {
        const child = spawn(process.execPath, [runner, '--compiler-options', '{"module":"CommonJS"}', script], { cwd: process.cwd(), detached: true, stdio: ['ignore', log, log], windowsHide: true });
        await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
        return NextResponse.json({ message: '已开始同步公开资料，页面会显示实际进度与缺失项' }, { status: 202 });
    } catch { return NextResponse.json({ message: '无法启动同步工具，请在源码目录运行抓取命令' }, { status: 500 }); }
    finally { fs.closeSync(log); }
}
