import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const codexHome = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'ai-notebook', 'codex-login');
const executable = process.env.CODEX_CLI_PATH || 'codex';
let activeLogin: { url: string; pid: number | undefined } | null = null;

function environment() {
    return { ...process.env, CODEX_HOME: codexHome };
}

async function run(args: string[], options: { input?: string; timeout?: number; cwd?: string } = {}) {
    await fs.mkdir(codexHome, { recursive: true });
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd: options.cwd || process.cwd(), env: environment(), windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => child.kill(), options.timeout || 30000);
        child.stdout.on('data', chunk => { stdout += String(chunk); });
        child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.on('error', error => { clearTimeout(timer); reject(error); });
        child.on('close', code => { clearTimeout(timer); resolve({ code: code || 0, stdout, stderr }); });
        child.stdin.end(options.input || '');
    });
}

export async function codexLoginStatus() {
    try {
        const result = await run(['login', 'status']);
        const loggedIn = result.code === 0 && /logged in using chatgpt/i.test(result.stdout + result.stderr);
        let email: string | undefined;
        if (loggedIn) {
            try {
                const auth = JSON.parse(await fs.readFile(path.join(codexHome, 'auth.json'), 'utf8'));
                const payload = JSON.parse(Buffer.from(String(auth.tokens?.id_token || '').split('.')[1], 'base64url').toString('utf8'));
                if (typeof payload.email === 'string') email = payload.email;
            } catch { /* Some CLI credential stores do not expose an ID token. */ }
        }
        return { installed: true, loggedIn, email };
    } catch {
        return { installed: false, loggedIn: false };
    }
}

export async function startCodexLogin(): Promise<string> {
    if (activeLogin) return activeLogin.url;
    await fs.mkdir(codexHome, { recursive: true });
    const child = spawn(executable, ['login'], {
        cwd: codexHome, env: environment(), detached: true, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const url = await new Promise<string>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error('Codex 登录页面启动超时')), 10000);
        const onData = (chunk: Buffer) => {
            output += String(chunk);
            const match = output.match(/https:\/\/auth\.openai\.com\/oauth\/authorize\?[^\s]+/);
            if (match) { clearTimeout(timer); resolve(match[0]); }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('close', () => { clearTimeout(timer); reject(new Error('Codex 登录进程提前结束，请重试')); });
    });
    activeLogin = { url, pid: child.pid };
    child.once('close', () => { if (activeLogin?.pid === child.pid) activeLogin = null; });
    child.unref();
    return url;
}

export async function logoutCodex() {
    const result = await run(['logout']);
    if (result.code !== 0) throw new Error('Codex 退出登录失败');
}

type Message = { role: string; content: unknown };

export async function codexCompletion(messages: Message[], model: string, timeout = 120000) {
    if (!(await codexLoginStatus()).loggedIn) throw new Error('AI_AUTH_ERROR: 请先在设置中完成 OpenAI Codex 网页登录');
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-notebook-codex-'));
    const output = path.join(folder, 'answer.txt');
    const images: string[] = [];
    try {
        const prompt = ['请只完成以下学习辅助任务。直接给出所要求的最终答案，不读取文件，不调用工具，不添加解释或 Markdown 围栏。'];
        for (const message of messages) {
            prompt.push(`\n[${message.role}]`);
            if (typeof message.content === 'string') { prompt.push(message.content); continue; }
            if (!Array.isArray(message.content)) continue;
            for (const part of message.content) {
                if (part?.type === 'text') prompt.push(String(part.text));
                if (part?.type === 'image_url' && typeof part.image_url?.url === 'string') {
                    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(part.image_url.url);
                    if (!match) throw new Error('不支持的图片格式');
                    const filename = path.join(folder, `image-${images.length}.${match[1].split('/')[1] === 'jpeg' ? 'jpg' : match[1].split('/')[1]}`);
                    await fs.writeFile(filename, Buffer.from(match[2], 'base64'));
                    images.push(filename);
                    prompt.push(`[已附图片 ${images.length}]`);
                }
            }
        }
        const args = ['exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', folder, '-m', model, '-o', output];
        for (const image of images) args.push('-i', image);
        args.push('-');
        const result = await run(args, { input: prompt.join('\n'), timeout, cwd: folder });
        if (result.code !== 0) {
            if (/model is not supported|model_not_found/i.test(result.stderr)) throw new Error(`AI_NOT_FOUND: 当前 ChatGPT 账号不能使用模型 ${model}，请在设置中更换可用模型后重试`);
            throw new Error(`Codex 调用失败：${result.stderr.slice(-400) || '请检查登录状态和模型权限'}`);
        }
        const answer = (await fs.readFile(output, 'utf8')).trim();
        if (!answer) throw new Error('Codex 未返回内容');
        return answer;
    } finally {
        await fs.rm(folder, { recursive: true, force: true });
    }
}
