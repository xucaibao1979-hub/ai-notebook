'use client';

import { useEffect, useState } from 'react';
import { Box, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ConfigBackup = { date: string; bytes: number };
type Inspection = { token: string; files: number; users: number; createdAt: string; message?: string };

export function SystemBackupPanel() {
    const [auto, setAuto] = useState<ConfigBackup[]>([]);
    const [exportPassword, setExportPassword] = useState('');
    const [restorePassword, setRestorePassword] = useState('');
    const [restoreFile, setRestoreFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetch('/api/system-backup?status=1').then(response => response.ok ? response.json() : null)
            .then(data => setAuto(data?.configBackups || [])).catch(() => {});
    }, []);

    async function exportBackup() {
        if (exportPassword.length < 8) { setMessage('请设置至少 8 个字符的备份密码。'); return; }
        setBusy(true); setMessage('正在创建加密备份，请保持页面打开…');
        try {
            const response = await fetch('/api/system-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export', password: exportPassword }) });
            if (!response.ok) throw new Error((await response.json()).message || '创建备份失败');
            const url = URL.createObjectURL(await response.blob());
            const anchor = document.createElement('a'); anchor.href = url;
            anchor.download = `ai-notebook-${new Date().toISOString().slice(0, 10)}.ainb`;
            document.body.append(anchor); anchor.click(); anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            setMessage('加密备份已下载。恢复时需要输入创建备份时的密码。');
            setExportPassword('');
        } catch (error) { setMessage(error instanceof Error ? error.message : '创建备份失败'); }
        finally { setBusy(false); }
    }

    async function restoreBackup() {
        const legacy = !!restoreFile && /\.(tar\.gz|tgz)$/i.test(restoreFile.name);
        if (!restoreFile || !legacy && restorePassword.length < 8) { setMessage('请选择备份文件并输入原始密码。'); return; }
        setBusy(true); setMessage('正在解密并校验备份…');
        try {
            const response = await fetch('/api/system-backup', { method: 'PUT', headers: legacy ? { 'X-Backup-Format': 'legacy-tar' } : { 'X-Backup-Password': restorePassword }, body: restoreFile });
            const inspection = await response.json() as Inspection;
            if (!response.ok) throw new Error(inspection.message || '备份校验失败');
            if (!window.confirm(`备份校验通过：${inspection.users} 个账户、${inspection.files} 个文件，创建于 ${new Date(inspection.createdAt).toLocaleString('zh-CN')}。恢复将替换当前配置及全部学习数据；恢复前会保存当前快照。继续吗？`)) { setMessage('备份已校验，未执行恢复。'); return; }
            const restored = await fetch('/api/system-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', token: inspection.token }) });
            const result = await restored.json();
            if (!restored.ok) throw new Error(result.message || '恢复失败');
            setMessage('恢复完成。请重新启动应用，使用备份中的账户登录。');
            setRestorePassword(''); setRestoreFile(null);
        } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败'); }
        finally { setBusy(false); }
    }

    async function restoreAuto(date: string) {
        if (!window.confirm(`恢复 ${date} 的系统配置？现有配置会先备份，随后需要重新启动应用。`)) return;
        setBusy(true);
        try {
            const response = await fetch('/api/system-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore-config', date }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '配置恢复失败');
            setMessage('配置已恢复。请重新启动应用。');
        } catch (error) { setMessage(error instanceof Error ? error.message : '配置恢复失败'); }
        finally { setBusy(false); }
    }

    return <section aria-label="备份与恢复" className="space-y-4 text-sm">
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                <div className="flex gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm"><Box className="size-6" /></span><div><h3 className="text-base font-semibold text-slate-900">导出配置</h3><p className="mt-1 text-slate-600">创建完整系统加密备份。</p></div></div>
                <ul className="mt-3 space-y-1 text-xs text-slate-600 sm:ml-16"><li>✓ 账户、模型与系统设置</li><li>✓ 题库、推荐历史、错题和图片</li><li>✓ AES-256-GCM 加密</li></ul>
                <div className="mt-4 space-y-2 sm:ml-16"><input aria-label="设置备份密码" type="password" autoComplete="new-password" placeholder="设置备份密码（至少 8 位）" value={exportPassword} onChange={event => setExportPassword(event.target.value)} className="h-10 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3" /><Button disabled={busy} onClick={exportBackup} className="bg-blue-600 hover:bg-blue-700"><Download className="mr-2 size-4" />创建备份</Button></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-100 p-5">
                <div className="flex gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-600 text-white shadow-sm"><Upload className="size-6" /></span><div><h3 className="text-base font-semibold text-slate-900">恢复配置</h3><p className="mt-1 text-slate-600">从加密备份导入；先备份当前数据。</p></div></div>
                <ul className="mt-3 space-y-1 text-xs text-slate-600 sm:ml-16"><li>✓ 校验密码与文件完整性</li><li>✓ 恢复前保存当前快照</li><li>✓ 恢复后重新启动应用</li></ul>
                <div className="mt-4 space-y-2 sm:ml-16"><input aria-label="选择加密备份文件" type="file" accept=".ainb,.tar.gz,.tgz" disabled={busy} onChange={event => setRestoreFile(event.target.files?.[0] || null)} className="block w-full max-w-xs text-xs" /><input aria-label="输入原始备份密码" type="password" autoComplete="off" placeholder="输入创建备份时的密码；旧版 tar.gz 无需密码" value={restorePassword} onChange={event => setRestorePassword(event.target.value)} className="h-10 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3" /><Button disabled={busy} onClick={restoreBackup} className="bg-slate-700 hover:bg-slate-800"><Upload className="mr-2 size-4" />恢复备份</Button></div>
            </div>
        </div>
        <p className="text-xs text-amber-800">备份包含账户和模型密钥，请妥善保存文件与密码。局域网 HTTP 传输不加密；Codex 网页登录令牌、浏览器会话、旧备份和运行日志不导出。</p>
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-medium text-slate-700">自动备份记录（{auto.length} 天）</summary><p className="mt-2 text-xs text-slate-500">应用运行时每小时备份数据库与学习记录，每天另存系统配置。</p><div className="mt-3 space-y-2 text-xs text-slate-600">{auto.length ? auto.map(item => <div key={item.date} className="flex flex-wrap items-center gap-3 rounded-lg border p-2"><span>{item.date} · 配置备份 {(item.bytes / 1024).toFixed(0)} KB</span><a className="text-blue-700" href={`/api/system-backup?configDate=${item.date}`}>下载</a><button type="button" className="text-blue-700 disabled:opacity-50" disabled={busy} onClick={() => restoreAuto(item.date)}>恢复这天配置</button></div>) : <p>尚无自动备份记录；启动约 1 分钟后首次生成。</p>}</div></details>
        {message && <p role="status" className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-blue-800">{message}</p>}
    </section>;
}
