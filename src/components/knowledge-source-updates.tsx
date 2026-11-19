'use client';

import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type SourceSyncStatus = { state: string; discovered: number; processed: number; imported: number; failed: number; checkedIndexes?: number; pendingCandidates?: number; completedAt?: string; retryAt?: string; errors?: { url: string; message: string }[] };

function label(status: SourceSyncStatus | null) {
    if (!status || status.state === 'idle') return '尚未更新';
    return ({ running: '更新中', completed: '已完成', completed_with_errors: '部分完成', rate_limited: '请求受限', access_denied: '访问受限', failed: '更新失败' } as Record<string, string>)[status.state] || '待继续';
}

function SourceCard({ title, description, status, unit, children }: { title: string; description: string; status: SourceSyncStatus | null; unit: string; children?: ReactNode }) {
    const warning = ['access_denied', 'rate_limited', 'failed'].includes(status?.state || '');
    return <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2"><div><h3 className="font-medium text-slate-800">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${warning ? 'bg-amber-50 text-amber-800' : status?.state === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>{label(status)}</span></div>
        {status && status.state !== 'idle' ? <div className="mt-4 space-y-2 text-xs text-slate-600"><p role="status">已处理 {status.processed}/{status.discovered} {unit} · 本次导入 {status.imported} 份 · 失败 {status.failed} {unit}</p>{status.state === 'running' && status.discovered > 0 && <progress aria-label={`${title}更新进度`} className="w-full accent-indigo-600" max={status.discovered} value={status.processed} />}{status.retryAt && status.state === 'rate_limited' && <p>可重试时间：{new Date(status.retryAt).toLocaleString('zh-CN')}</p>}{!!status.errors?.length && <details><summary className="cursor-pointer text-indigo-700">查看失败原因</summary>{status.errors.map((item, index) => <p key={index} className="break-all">{item.url}：{item.message}</p>)}</details>}</div> : <p className="mt-4 text-xs text-slate-500">尚无更新记录</p>}
        {children}
    </article>;
}

export function KnowledgeSourceUpdates({ primary, other, cache, primarySavedCount, savedCount, admin, busy, onPrimary, onOther, onCache }: { primary: SourceSyncStatus | null; other: SourceSyncStatus | null; cache: SourceSyncStatus | null; primarySavedCount: number; savedCount: number; admin: boolean; busy: boolean; onPrimary: () => void; onOther: () => void; onCache: () => void }) {
    const running = [primary, other, cache].some(status => status?.state === 'running');
    return <section aria-labelledby="source-updates-title" className="space-y-3">
        <div><h2 id="source-updates-title" className="text-base font-semibold text-slate-800">试卷资料来源与更新</h2><p className="mt-1 text-xs text-slate-500">每个来源独立更新。“刷新目录”只重新加载已保存的资料列表。</p></div>
        <div className="grid gap-3 md:grid-cols-2">
            <SourceCard title="原来源试卷" description="从原公开来源获取，保留已保存内容和更新断点。" status={primary} unit="页">
                <p className="mt-3 text-xs font-medium text-slate-700">当前已收录 {primarySavedCount} 份；来源访问受限不会删除已保存资料。</p>
                {primary?.state === 'access_denied' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">原站拒绝自动访问（HTTP 403），在线更新已暂停。可解析本地缓存或更新其他公开来源。</p>}
                {primary?.state === 'rate_limited' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">原站要求延后请求（HTTP 429），请等待来源允许后继续。</p>}
                {admin && <div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={busy || running || primary?.state === 'access_denied' || (primary?.state === 'rate_limited' && !!primary.retryAt && Date.parse(primary.retryAt) > Date.now())} onClick={onPrimary}>{primary?.state === 'running' ? '更新中…' : primary && primary.processed < primary.discovered ? '继续更新' : '更新原来源'}</Button><Button size="sm" variant="outline" disabled={busy || running} onClick={onCache}>解析本地缓存</Button></div>}
            </SourceCard>
            <SourceCard title="其他公开来源" description="每次检查中国教育在线和高考100的公开目录，再验证新发现的试卷；中考网保留已登记来源。" status={other} unit="份">
                <p className="mt-3 text-xs font-medium text-slate-700">当前已收录 {savedCount} 份 · 本轮候选 {other?.discovered ?? '待同步'} 份</p>
                {other?.state === 'running' && !other.checkedIndexes && <p className="mt-2 text-xs text-indigo-700">正在搜索公开目录，请稍候…</p>}
                {!!other?.checkedIndexes && <p className="mt-2 text-xs text-slate-700">已检查 {other.checkedIndexes} 个来源目录 · 待处理 {other.pendingCandidates ?? 0} 份{other.completedAt ? ` · 更新于 ${new Date(other.completedAt).toLocaleString('zh-CN')}` : ''}</p>}
                {other?.state === 'completed' && other.imported === 0 && other.pendingCandidates === 0 && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">已重新搜索，当前公开目录没有新增可处理的试卷。</p>}
                <p className="mt-3 text-xs leading-5 text-slate-500">仅获取并验证成功的原卷计入收录。目录可能包含失效链接；图片整卷尚未拆分为单题。</p>
                {admin && <Button size="sm" variant="outline" className="mt-4" disabled={busy || running} onClick={onOther}>{other?.state === 'running' ? '更新中…' : '更新其他来源'}</Button>}
            </SourceCard>
        </div>
        {cache && cache.state !== 'idle' && <SourceCard title="本地缓存解析" description="仅重新解析已下载页面，不访问原站，也不会补入没有缓存的试卷。" status={cache} unit="页" />}
        <p className="text-xs text-slate-500">公开来源覆盖有限；“更新完成”表示当前目录已处理，不代表所有试卷均已收录。</p>
    </section>;
}
