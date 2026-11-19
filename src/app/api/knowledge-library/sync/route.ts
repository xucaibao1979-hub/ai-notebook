import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Next can be started from the parent workspace while serving this project directory.
// Keep the worker cwd and its checkpoint directory anchored to the same project root.
const cwd = process.cwd();
const projectRoot = fs.existsSync(path.join(cwd, 'scripts', 'sync-knowledge-library.ts'))
    ? cwd
    : fs.existsSync(path.join(cwd, 'wrong-notebook-main', 'scripts', 'sync-knowledge-library.ts'))
        ? path.join(cwd, 'wrong-notebook-main')
        : cwd;
const directory = path.join(projectRoot, 'data', 'knowledge-library');
const statusPath = path.join(directory, 'sync-status.json');
const imageStatusPath = path.join(directory, 'image-sync-status.json');
const cacheStatusPath = path.join(directory, 'cache-sync-status.json');
export async function GET(req?: Request) {
    const source = req ? new URL(req.url).searchParams.get('source') : null;
    if (source && !['other', 'cache'].includes(source)) return NextResponse.json({ message: '不支持的同步来源' }, { status: 400 });
    const imageOnly = source === 'other';
    const cacheOnly = source === 'cache';
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const status = JSON.parse(fs.readFileSync(imageOnly ? imageStatusPath : cacheOnly ? cacheStatusPath : statusPath, 'utf8'));
        const publicStatus = { ...status };
        delete publicStatus.completedUrls;
        if (publicStatus.state === 'rate_limited' && status.errors?.some((error: { url?: string; message?: string }) => /^https?:\/\/kaosj\.com\//.test(error.url || '') && /HTTP 403\b/.test(error.message || ''))) publicStatus.state = 'access_denied';
        return NextResponse.json({ ...publicStatus, errors: status.errors?.slice(-10).map((item: { url: string; message: string }) => ({ ...item, message: item.message.includes('ENOENT') ? '该页面未取得可解析的原始正文，来源仅提供附件或内容不完整，待补充。' : item.message })) });
    } catch { return NextResponse.json({ state: 'idle', discovered: 0, processed: 0, imported: 0, failed: 0 }); }
}
export async function POST(req?: Request) {
    const source = req ? new URL(req.url).searchParams.get('source') : null;
    if (source && !['other', 'cache'].includes(source)) return NextResponse.json({ message: '不支持的同步来源' }, { status: 400 });
    const imageOnly = source === 'other';
    const cacheOnly = source === 'cache';
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    if (fs.existsSync(path.join(directory, 'sync.lock'))) return NextResponse.json({ message: '已有抓取任务正在进行' }, { status: 409 });
    // Respect the blocked host only for that source; other hosts have separate checkpoints.
    if (!imageOnly && !cacheOnly) try {
        const previous = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as { state?: string; retryAt?: string; errors?: { url?: string; message?: string }[] };
        if (previous.state === 'access_denied' || (previous.state === 'rate_limited' && previous.errors?.some(error => /^https?:\/\/kaosj\.com\//.test(error.url || '') && /HTTP 403\b/.test(error.message || '')))) return NextResponse.json({ message: '来源拒绝自动访问（HTTP 403）；请使用已收录内容或取得来源许可后再同步' }, { status: 403 });
        if (previous.state === 'rate_limited' && previous.retryAt && Date.parse(previous.retryAt) > Date.now()) return NextResponse.json({ message: `来源要求暂停抓取，请在 ${previous.retryAt} 后再试` }, { status: 429 });
    } catch { /* No usable prior checkpoint. */ }
    // A stale running status without a lock is recoverable after a server/process restart.
    if (cacheOnly && (!fs.existsSync(path.join(directory, 'source-sitemap.xml')) || !fs.existsSync(path.join(directory, 'raw')))) return NextResponse.json({ message: '没有可重新解析的本地页面缓存' }, { status: 422 });
    const compiledScript = path.join(projectRoot, 'scripts', 'sync-knowledge-library.js');
    const sourceScript = path.join(projectRoot, 'scripts', 'sync-knowledge-library.ts');
    const runner = path.join(projectRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');
    const workerArgs = fs.existsSync(compiledScript)
        ? [compiledScript]
        : fs.existsSync(sourceScript) && fs.existsSync(runner)
            ? [runner, '--compiler-options', '{"module":"CommonJS"}', sourceScript]
            : null;
    if (!workerArgs) return NextResponse.json({ message: '当前安装缺少题库同步组件，请运行最新版安装包修复' }, { status: 422 });
    fs.mkdirSync(directory, { recursive: true });
    const log = fs.openSync(path.join(directory, 'sync.log'), 'a');
    try {
        const child = spawn(process.execPath, [...workerArgs, '--resume', ...(imageOnly ? ['--image-only'] : cacheOnly ? ['--cache-only'] : [])],  { cwd: projectRoot, detached: true, stdio: ['ignore', log, log], windowsHide: true });
        await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
        return NextResponse.json({ message: imageOnly ? '已启动其他公开来源的独立同步，不会访问受限来源' : cacheOnly ? '已启动本地缓存重新解析，不会访问来源网站' : '已开始同步公开资料，页面会显示实际进度与缺失项' }, { status: 202 });
    } catch { return NextResponse.json({ message: '无法启动同步工具，请在源码目录运行抓取命令' }, { status: 500 }); }
    finally { fs.closeSync(log); }
}
