"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Sparkles, Loader2, RefreshCw, ArrowRight, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { WeeklyStatistics } from '@/lib/weekly-analysis';

type Report = { id: string; notebookId: string | null; notebook?: { name: string } | null; periodStart: string; periodEnd: string; status: string; message: string; statistics: WeeklyStatistics; summary: string; exerciseSetId: string | null };
function dateLabel(date: string) { return new Date(date).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }); }

export function WeeklyReview({ notebookId }: { notebookId?: string }) {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        try { const result = await apiClient.get<{ reports: Report[] }>('/api/weekly-review', { params: notebookId ? { notebookId } : {} }); setReports(result.reports); }
        catch { setError('无法加载每周报告，请稍后刷新'); }
        finally { setLoading(false); }
    }, [notebookId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!reports.some(report => report.status === 'analyzing')) return;
        const timer = setInterval(load, 10000); return () => clearInterval(timer);
    }, [reports, load]);
    async function analyze() {
        setBusy(true); setError('');
        try { await apiClient.post('/api/weekly-review', notebookId ? { notebookId } : {}, { timeout: 300000 }); await load(); }
        catch (error) { setError(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    return <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><CalendarDays className="size-5 text-indigo-500" />每周薄弱点分析</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">每周自动整理最近七天新增错题，识别高频、未掌握的知识点，并由已配置的 AI 生成专项变式练习。服务关闭期间不会执行，重新启动后会补做尚未生成的本周分析。</p></div><Button onClick={analyze} disabled={busy || loading || reports.some(report => report.status === 'analyzing')} className="bg-indigo-500 hover:bg-indigo-600">{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{busy ? '正在分析与出题…' : reports.length ? '重新分析最近七天' : '立即分析最近七天'}</Button></div>
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {loading ? <p className="mt-5 text-sm text-slate-400">正在加载每周报告…</p> : !reports.length ? <p className="mt-5 rounded-xl border border-dashed border-indigo-200 p-5 text-sm text-slate-500">本周分析尚未生成。可点击立即分析，或等待自动检查。</p> : <div className="mt-5 space-y-4">{reports.map(report => <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-700">{report.notebook?.name || (notebookId ? '当前错题本' : '错题本专项报告')}</h3><span className="text-xs text-slate-400">{dateLabel(report.periodStart)} — {dateLabel(report.periodEnd)} · 最近七天</span></div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span>新增错题 <b className="text-slate-700">{report.statistics.total}</b></span><span>尚未掌握 <b className="text-amber-600">{report.statistics.unmastered}</b></span><span>已掌握 <b className="text-emerald-600">{report.statistics.mastered}</b></span></div>
            {!!report.statistics.weakPoints.length && <div className="mt-4 space-y-2">{report.statistics.weakPoints.slice(0, 5).map(point => <div key={`${point.subject}:${point.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="flex items-center gap-2 text-slate-600"><Target className="size-3.5 text-indigo-400" />{point.subject} · {point.name}</span><span className="text-slate-400">出现 {point.count} 次 · {point.unmastered} 题未掌握</span></div>)}<p className="text-[11px] text-slate-400">排序依据错题频次与掌握程度，详细原因需结合 AI 分析和实际作答核对。</p></div>}
            <p className={`mt-4 text-xs leading-6 ${report.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>{report.status === 'analyzing' ? '后台正在分析薄弱点并生成练习…' : report.message}</p>
            {report.summary && <details className="mt-4 rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-sm text-indigo-600">查看 AI 薄弱点分析与复习建议</summary><div className="mt-3"><MarkdownRenderer content={report.summary} /></div></details>}
            {report.exerciseSetId && <Link href={`/ai-practice?set=${report.exerciseSetId}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600">开始薄弱点专项练习<ArrowRight className="size-4" /></Link>}
        </article>)}</div>}
        <div className="mt-4 flex items-center justify-between"><span className="text-[11px] text-slate-400">每周报告按账号和错题本独立保存，避免重复生成。</span><button className="inline-flex items-center gap-1 text-xs text-indigo-500" onClick={load} disabled={busy}><RefreshCw className="size-3" />刷新报告</button></div>
    </section>;
}
