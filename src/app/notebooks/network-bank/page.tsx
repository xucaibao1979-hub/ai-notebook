'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { apiClient, friendlyApiError } from '@/lib/api-client';

type BankItem = { id: string; title: string; subject: string; year: number; examGrade: number; sourceName: string; sourceUrl: string; fetchedAt: string; questionCount: number; types: string[]; knowledgePoints: string[]; moreKnowledgePoints: number };

export default function NetworkBankPage() {
    const [items, setItems] = useState<BankItem[]>([]);
    const [subject, setSubject] = useState('全部');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const refresh = () => {
        setLoading(true); setError('');
        apiClient.get<{ items: BankItem[] }>('/api/learning/network-bank').then(result => setItems(result.items)).catch(cause => setError(friendlyApiError(cause))).finally(() => setLoading(false));
    };
    useEffect(() => {
        let active = true;
        apiClient.get<{ items: BankItem[] }>('/api/learning/network-bank').then(result => { if (active) setItems(result.items); }).catch(cause => { if (active) setError(friendlyApiError(cause)); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);
    const shown = subject === '全部' ? items : items.filter(item => item.subject === subject);
    return <main className="mx-auto max-w-5xl space-y-6 p-4 pb-16 sm:p-8">
        <Link href="/notebooks" className="inline-flex items-center gap-2 text-sm text-indigo-700"><ArrowLeft className="size-4" />返回错题本</Link>
        <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">网络题库</h1><p className="mt-2 text-sm text-slate-500">查看已收录试卷的题型、知识点及最近收录时间；此处只展示元数据，不会自动添加到个人错题本。</p></div><button onClick={refresh} disabled={loading} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-indigo-700 disabled:opacity-50">刷新列表</button></header>
        <div className="flex flex-wrap items-center gap-3"><label htmlFor="bank-subject" className="text-sm text-slate-600">科目</label><select id="bank-subject" className="rounded-lg border border-slate-200 bg-white p-2 text-sm" value={subject} onChange={event => setSubject(event.target.value)}><option>全部</option>{[...new Set(items.map(item => item.subject))].map(name => <option key={name}>{name}</option>)}</select><span className="text-xs text-slate-500">已收录 {shown.length} 份试卷 · {shown.reduce((sum, item) => sum + item.questionCount, 0)} 道题</span></div>
        {loading && <p role="status" className="text-sm text-slate-500">正在读取题库…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {!loading && !error && !shown.length && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">当前科目暂无已收录的网络题目。题库收录后可在此查看题型与知识点。</p>}
        <div className="space-y-4">{shown.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-slate-800">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{item.subject} · {item.year} 年 · {item.examGrade} 年级 · {item.questionCount} 道题</p></div><span className="text-xs text-slate-500">收录/更新：{new Date(item.fetchedAt).toLocaleString('zh-CN')}</span></div><p className="mt-3 text-sm text-slate-600">题目类型：{item.types.join('、') || '暂无标注'}</p><p className="mt-2 text-sm leading-6 text-slate-600">知识点：{item.knowledgePoints.join('、') || '暂无标注'}{item.moreKnowledgePoints > 0 && ` 等 ${item.moreKnowledgePoints} 项`}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-sm"><span className="text-slate-500">来源：{item.sourceName}</span>{/^https?:\/\//i.test(item.sourceUrl) && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-700">查看来源<ExternalLink className="size-3" /></a>}</div></article>)}</div>
    </main>;
}
