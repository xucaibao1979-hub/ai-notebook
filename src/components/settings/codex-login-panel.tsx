'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2 } from 'lucide-react';

export function CodexLoginPanel() {
    const [status, setStatus] = useState<{ installed: boolean; loggedIn: boolean; email?: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [authUrl, setAuthUrl] = useState('');
    const refresh = useCallback(async () => {
        try {
            const response = await fetch('/api/ai/codex-login', { cache: 'no-store' });
            if (!response.ok) throw new Error(`登录状态接口返回 ${response.status}`);
            setStatus(await response.json());
            setError('');
        } catch (cause) { setError(cause instanceof Error ? cause.message : '无法读取登录状态'); }
    }, []);
    useEffect(() => {
        void refresh();
        const timer = setInterval(() => { void refresh(); }, 3000);
        return () => clearInterval(timer);
    }, [refresh]);

    const action = async (method: 'POST' | 'DELETE') => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/ai/codex-login', { method });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || '操作失败');
            if (method === 'POST' && typeof body.authUrl === 'string') {
                setAuthUrl(body.authUrl);
                window.open(body.authUrl, '_blank', 'noopener,noreferrer');
            }
            await refresh();
        } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
        finally { setBusy(false); }
    };

    return <div className="rounded-xl border border-slate-200 bg-white p-4" role="region" aria-label="OpenAI Codex 网页登录">
        <h4 className="text-base font-semibold">OpenAI Codex</h4>
        <p className="mt-1 text-xs text-slate-500">使用 ChatGPT/Codex 账号在浏览器登录，无需 API Key。登录只供本站使用。</p>
        {status?.loggedIn ? <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700"><div className="flex items-center gap-2"><CheckCircle2 className="size-4" />已登录 OpenAI Codex</div>{status.email && <p className="ml-6 mt-1 text-xs text-slate-600">{status.email}</p>}</div>
            : <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{status === null ? '正在检查登录状态…' : status.installed ? '尚未登录 OpenAI Codex' : '本机未找到 Codex CLI，请先安装'}</div>}
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
        {authUrl && !status?.loggedIn && <p className="mt-2 text-xs text-slate-600">浏览器登录后请完成授权并等待状态更新。若页面未打开，<a href={authUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">点击打开登录页</a>。</p>}
        <div className="mt-4 flex items-center justify-between">
            <Button type="button" variant="ghost" className="text-red-600" disabled={busy || !status?.loggedIn} onClick={() => void action('DELETE')}>退出登录</Button>
            <Button type="button" variant="outline" disabled={busy || status?.installed === false} onClick={() => void action('POST')}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}{status?.loggedIn ? '重新登录' : '网页登录'}</Button>
        </div>
    </div>;
}
