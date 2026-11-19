'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type ConfigBackup = { date: string; bytes: number };
type Inspection = { token: string; files: number; users: number; createdAt: string; bytes: number };

export function BackupScopeInfo() {
    return <section className="space-y-2 rounded-xl border p-4 text-sm">
        <h3 className="font-semibold">现有备份入口包含什么</h3>
        <div className="grid gap-2 text-slate-600 sm:grid-cols-2">
            <p><strong className="text-slate-800">下载当前身份备份：</strong>当前身份的年级与学习偏好、科目、错题与图片、知识点、复习安排、练习与作答、批改、周报、使用过的试卷、教材依据和目录历史。</p>
            <p><strong className="text-slate-800">下载全部家庭身份备份：</strong>主账户及家庭学习身份各自的上述学习数据，适合迁移家庭学习记录。</p>
            <p><strong className="text-slate-800">选择备份并校验：</strong>读取已下载的学习 JSON，校验格式、校验和、图片与关联关系，预览可恢复数量；不会立即写入。</p>
            <p><strong className="text-slate-800">检查备份可恢复性：</strong>对当前身份现场生成备份并做恢复前演练，不更改现有记录。</p>
        </div>
        <p className="text-xs text-amber-800">以上是学习数据备份，不包含账户密码、模型密钥、完整公开题库和系统配置；这些内容请使用下方的完整系统备份。</p>
    </section>;
}

export function SystemBackupPanel() {
    const [configBackups, setConfigBackups] = useState<ConfigBackup[]>([]);
    const [inspection, setInspection] = useState<Inspection | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => {
        fetch('/api/system-backup?status=1').then(r => r.ok ? r.json() : null).then(data => setConfigBackups(data?.configBackups || [])).catch(() => {});
    }, []);

    async function inspect(file?: File) {
        if (!file) return;
        setBusy(true); setInspection(null); setMessage('正在校验完整系统备份…');
        try {
            const response = await fetch('/api/system-backup', { method: 'PUT', body: file });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '备份校验失败');
            setInspection(result);
            setMessage('校验通过。恢复前会自动保存当前系统快照；恢复后需要重新打开应用。');
        } catch (error) { setMessage(error instanceof Error ? error.message : '备份校验失败'); }
        finally { setBusy(false); }
    }

    async function restore() {
        if (!inspection || !window.confirm('确认恢复整个系统？现有数据库、配置、题库、图片和学习记录将由备份替换。恢复前会自动留存当前快照。')) return;
        setBusy(true);
        try {
            const response = await fetch('/api/system-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore', token: inspection.token }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '系统恢复失败');
            setMessage(`恢复完成；请重新点击桌面图标启动应用。恢复前快照：${result.safetyBackup}`);
            setInspection(null);
        } catch (error) { setMessage(error instanceof Error ? error.message : '系统恢复失败'); }
        finally { setBusy(false); }
    }

    async function restoreConfig(date: string) {
        if (!window.confirm(`恢复 ${date} 的系统配置？现有配置会先备份，随后需要重新打开应用。`)) return;
        setBusy(true);
        try {
            const response = await fetch('/api/system-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'restore-config', date }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || '配置恢复失败');
            setMessage('配置已恢复；请重新点击桌面图标启动应用。');
        } catch (error) { setMessage(error instanceof Error ? error.message : '配置恢复失败'); }
        finally { setBusy(false); }
    }

    return <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 text-sm">
        <h3 className="font-semibold">完整系统备份与恢复（管理员）</h3>
        <p className="text-slate-600">包含全部账户和身份、密码哈希、模型配置、系统设置、完整题库与推荐历史、错题本、练习、教材目录、拍照图片及其他应用数据。自动备份仍每小时保存数据库和学习数据；系统配置每天另存一份。</p>
        <p className="text-xs text-amber-800">完整备份含模型密钥和账户数据，请妥善保管。Codex 网页登录令牌、浏览器会话、运行日志和旧备份不导出；恢复后可能需要重新登录 Codex。</p>
        <div className="flex flex-wrap items-center gap-2">
            <a href="/api/system-backup" className="rounded-lg bg-indigo-600 px-3 py-2 text-white">手动下载全部内容</a>
            <label className="cursor-pointer rounded-lg border bg-white px-3 py-2">选择完整备份并校验<input className="hidden" type="file" accept=".tar.gz,.tgz,application/gzip" disabled={busy} onChange={event => inspect(event.target.files?.[0])} /></label>
            {inspection && <Button disabled={busy} onClick={restore}>恢复已校验的完整备份</Button>}
        </div>
        {inspection && <p>备份时间：{new Date(inspection.createdAt).toLocaleString('zh-CN')} · {inspection.users} 个账户 · {inspection.files} 个文件 · {(inspection.bytes / 1024 / 1024).toFixed(1)} MB</p>}
        <details><summary className="cursor-pointer">每天自动备份的系统配置（{configBackups.length}）</summary>
            <div className="mt-2 space-y-2">{configBackups.length ? configBackups.map(item => <div key={item.date} className="flex flex-wrap items-center gap-3 rounded-lg border bg-white px-3 py-2"><span>{item.date} · {(item.bytes / 1024).toFixed(0)} KB</span><a className="text-indigo-700" href={`/api/system-backup?configDate=${item.date}`}>下载</a><button className="text-indigo-700 disabled:opacity-50" disabled={busy} onClick={() => restoreConfig(item.date)}>恢复这天配置</button></div>) : <p className="text-slate-500">启动后首次自动备份约在 1 分钟内生成，之后每天保留一份。</p>}</div>
        </details>
        {message && <p role="status" className="text-indigo-800">{message}</p>}
        {busy && <p className="text-slate-600">正在处理，请保持页面打开…</p>}
    </section>;
}
