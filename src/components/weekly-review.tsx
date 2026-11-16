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
    const emptyWeek = reports.length > 0 && reports.every(report => report.statistics.total === 0 && report.status !== 'failed' && report.status !== 'analyzing' && !report.exerciseSetId);
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><CalendarDays className="size-5 text-indigo-500" />每周薄弱点分析</h2><p className="mt-1 text-xs leading-5 text-slate-500">汇总最近七天新增错题；有薄弱点时提供分析和专项练习。</p></div><Button variant="outline" onClick={analyze} disabled={busy || loading || reports.some(report => report.status === 'analyzing')}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{busy ? '正在分析与出题…' : reports.length ? '重新分析' : '立即分析'}</Button></div>
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        {loading ? <p className="mt-5 text-sm text-slate-400">正在加载每周报告…</p> : !reports.length ? <p className="mt-5 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">本周尚无报告。系统会自动检查，也可手动分析。</p> : <details key={emptyWeek ? 'empty' : 'active'} open={!emptyWeek} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50"><summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">{emptyWeek ? `最近七天没有新增错题 · 查看 ${reports.length} 份科目报告` : `查看本周 ${reports.length} 份科目报告`}</summary><div className="space-y-3 border-t border-slate-200 p-3">{reports.map(report => <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-700">{report.notebook?.name || (notebookId ? '当前错题本' : '错题本专项报告')}</h3><span className="text-xs text-slate-400">{dateLabel(report.periodStart)} — {dateLabel(report.periodEnd)} · 最近七天</span></div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500"><span>新增错题 <b className="text-slate-700">{report.statistics.total}</b></span><span>尚未掌握 <b className="text-amber-600">{report.statistics.unmastered}</b></span><span>已掌握 <b className="text-emerald-600">{report.statistics.mastered}</b></span></div>
            {!!report.statistics.weakPoints.length && <div className="mt-4 space-y-2">{report.statistics.weakPoints.slice(0, 5).map(point => <div key={`${point.subject}:${point.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><span className="flex items-center gap-2 text-slate-600"><Target className="size-3.5 text-indigo-400" />{point.subject} · {point.name}</span><span className="text-slate-400">出现 {point.count} 次 · {point.unmastered} 题未掌握</span></div>)}<p className="text-[11px] text-slate-400">排序依据错题频次与掌握程度，详细原因需结合 AI 分析和实际作答核对。</p></div>}
            <p className={`mt-4 text-xs leading-6 ${report.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>{report.status === 'analyzing' ? '后台正在分析薄弱点并生成练习…' : report.message}</p>
            {report.summary && <details className="mt-4 rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-sm text-indigo-600">查看 AI 薄弱点分析与复习建议</summary><div className="mt-3"><MarkdownRenderer content={report.summary} /></div></details>}
            {report.exerciseSetId && <Link href={`/ai-practice?set=${report.exerciseSetId}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600">开始薄弱点专项练习<ArrowRight className="size-4" /></Link>}
        </article>)}</div></details>}
        <div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-slate-400">报告按当前学习身份保存。</span><button type="button" className="inline-flex items-center gap-1 text-xs text-indigo-600" onClick={load} disabled={busy}><RefreshCw className="size-3" />刷新报告</button></div>
    </section>;
}
