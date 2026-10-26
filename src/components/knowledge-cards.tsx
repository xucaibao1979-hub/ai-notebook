"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Card = { id: string; subject: string; title: string; concept: string; pitfall: string; method: string; grade: string | null; chapter: string | null; status: string; updatedAt: string; errors: { errorItemId: string; errorItem: { questionText: string } }[] };
type GeneratedPoint = { id: string; subject: string; title: string; grade: string | null; count: number; setId: string; updatedAt: string };

export function KnowledgeCards() {
    const requested = useSearchParams().get('card');
    const [cards, setCards] = useState<Card[]>([]);
    const [generated, setGenerated] = useState<GeneratedPoint[]>([]);
    const [subject, setSubject] = useState('');
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string | null>(requested);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Partial<Card>>({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    useEffect(() => { apiClient.get<Card[]>('/api/knowledge-cards').then(setCards).catch(e => setMessage(friendlyApiError(e))); apiClient.get<GeneratedPoint[]>('/api/knowledge-cards/generated').then(setGenerated).catch(e => setMessage(friendlyApiError(e))); }, []);
    const subjects = [...new Set([...cards.map(card => card.subject), ...generated.map(point => point.subject)])];
    const filtered = cards.filter(card => (!subject || card.subject === subject) && (!query || [card.title, card.concept, card.pitfall, card.chapter || ''].some(value => value.toLocaleLowerCase().includes(query.toLocaleLowerCase()))));
    const filteredGenerated = generated.filter(point => (!subject || point.subject === subject) && (!query || point.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    const active = cards.find(card => card.id === selected);
    async function save() {
        if (!active) return;
        setBusy(true); setMessage('');
        try {
            await apiClient.patch('/api/knowledge-cards', { id: active.id, title: draft.title, concept: draft.concept, pitfall: draft.pitfall, method: draft.method, chapter: draft.chapter || null, status: draft.status });
            setCards(await apiClient.get<Card[]>('/api/knowledge-cards')); setEditing(false); setMessage('知识卡已更新');
        } catch (e) { setMessage(friendlyApiError(e)); }
        finally { setBusy(false); }
    }
    return <section className="mx-auto max-w-6xl space-y-5 px-5 py-6 md:px-8"><div><h1 className="text-2xl font-semibold text-slate-800">我的知识点</h1><p className="mt-1 text-sm text-slate-500">汇总随机出题中使用的知识点，并展示手动提炼的知识卡；同科目同名知识点只显示一次。</p></div><div className="flex flex-wrap gap-3"><Input aria-label="搜索知识点" placeholder="搜索知识点、概念、误区或章节" value={query} onChange={e => setQuery(e.target.value)} className="min-w-52 flex-1" /><select aria-label="按科目筛选" value={subject} onChange={e => setSubject(e.target.value)} className="rounded-lg border bg-white px-3 text-sm"><option value="">全部科目</option>{subjects.map(name => <option key={name}>{name}</option>)}</select></div>{message && <p role="status" className="text-sm text-indigo-600">{message}</p>}
        {filtered.length || filteredGenerated.length ? <div className="grid gap-3 md:grid-cols-2">{filtered.map(card => <button key={card.id} onClick={() => { setSelected(card.id); setEditing(false); }} className="rounded-xl border bg-white p-5 text-left hover:border-indigo-300"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-800">{card.title}</h2><span className="text-xs text-indigo-500">{card.status === 'mastered' ? '已掌握' : '待巩固'}</span></div><p className="mt-1 text-xs text-slate-500">{card.subject}{card.grade ? ` · ${card.grade}` : ''}{card.chapter ? ` · ${card.chapter}` : ''} · 关联 {card.errors.length} 道错题</p><p className="mt-3 line-clamp-2 text-sm text-slate-600">{card.concept || card.method || '点击补充核心概念与解题方法'}</p></button>)}{filteredGenerated.map(point => <div key={point.id} className="rounded-xl border bg-white p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-800">{point.title}</h2><span className="text-xs text-indigo-500">出题知识点</span></div><p className="mt-1 text-xs text-slate-500">{point.subject}{point.grade ? ` · ${point.grade}` : ''} · 出现在 {point.count} 道习题中</p><div className="mt-3 flex gap-4 text-sm"><Link href={`/ai-practice?set=${encodeURIComponent(point.setId)}`} className="text-indigo-600">查看相关练习</Link><Link href={`/ai-practice?subject=${encodeURIComponent(point.subject)}&knowledgePoint=${encodeURIComponent(point.title)}&new=1`} className="text-indigo-600">按此知识点出题</Link></div></div>)}</div> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">{cards.length || generated.length ? '没有匹配的知识点。' : '暂无知识点。随机出题并保存练习后，相关知识点会自动显示在这里。'}</div>}
        {active && <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setSelected(null)}><div role="dialog" aria-modal="true" aria-label="知识点详情" className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}><div className="flex justify-between gap-3"><div><p className="text-xs text-indigo-500">{active.subject} · {active.grade || '未标注年级'}</p><h2 className="mt-1 text-xl font-semibold">{active.title}</h2></div><button onClick={() => setSelected(null)} className="text-sm text-slate-500">关闭</button></div><p className="mt-2 text-xs text-slate-500">{active.chapter || '未标注章节'} · 最近更新 {new Date(active.updatedAt).toLocaleDateString('zh-CN')}</p>{editing ? <div className="mt-5 space-y-3"><label className="block text-sm">名称<Input className="mt-1" value={draft.title || ''} onChange={e => setDraft(v => ({ ...v, title: e.target.value }))} maxLength={100} /></label>{([['concept', '核心概念'], ['pitfall', '常见误区'], ['method', '解题方法']] as const).map(([field, label]) => <label key={field} className="block text-sm">{label}<Textarea className="mt-1" value={draft[field] || ''} onChange={e => setDraft(v => ({ ...v, [field]: e.target.value }))} maxLength={4000} /></label>)}<label className="block text-sm">章节<Input className="mt-1" value={draft.chapter || ''} onChange={e => setDraft(v => ({ ...v, chapter: e.target.value }))} maxLength={100} /></label><div className="flex gap-2"><Button disabled={busy || !draft.title?.trim()} onClick={save}>保存</Button><Button variant="outline" onClick={() => setEditing(false)}>取消</Button></div></div> : <><div className="mt-5 space-y-5 text-sm leading-7">{[['核心概念', active.concept], ['常见误区', active.pitfall], ['解题方法', active.method]].map(([label, value]) => <div key={label}><h3 className="font-semibold text-slate-700">{label}</h3><p className="whitespace-pre-wrap text-slate-600">{value || '尚未补充'}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setDraft(active); setEditing(true); }}>编辑知识卡</Button><Button variant="outline" onClick={async () => { await apiClient.patch('/api/knowledge-cards', { id: active.id, status: active.status === 'mastered' ? 'reviewing' : 'mastered' }); setCards(await apiClient.get<Card[]>('/api/knowledge-cards')); }}>{active.status === 'mastered' ? '标记待巩固' : '标记已掌握'}</Button><Link href={`/ai-practice?subject=${encodeURIComponent(active.subject)}&knowledgePoint=${encodeURIComponent(active.title)}&new=1`} className="inline-flex items-center rounded-lg bg-indigo-500 px-4 text-sm text-white">练习此知识点</Link></div><h3 className="mt-7 font-semibold">关联错题 · {active.errors.length}</h3><div className="mt-2 space-y-2">{active.errors.map(link => <Link key={link.errorItemId} href={`/error-items/${link.errorItemId}`} className="block rounded-lg border p-3 text-sm text-indigo-600">{(link.errorItem.questionText || '查看错题').slice(0, 90)}</Link>)}</div></>}</div></div>}
    </section>;
}
