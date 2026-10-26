"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiClient, friendlyApiError } from '@/lib/api-client';

type Card = { id: string; title: string; subject: string };
type ErrorSummary = { id: string; subject: string; tags: string[]; grade?: string | null; analysis?: string | null; mistakeAnalysis?: string | null };

export function ErrorKnowledgeCards({ error }: { error: ErrorSummary }) {
    const [cards, setCards] = useState<Card[]>([]);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [title, setTitle] = useState('');
    const [concept, setConcept] = useState('');
    const [pitfall, setPitfall] = useState('');
    const [method, setMethod] = useState('');
    const [chapter, setChapter] = useState('');
    useEffect(() => { apiClient.get<Card[]>('/api/knowledge-cards', { params: { errorItemId: error.id } }).then(setCards).catch(() => {}); }, [error.id]);
    function start() {
        setTitle(error.tags[0] || '');
        setConcept('');
        setPitfall(error.mistakeAnalysis || '');
        setMethod(error.analysis || '');
        setChapter('');
        setMessage('');
        setOpen(true);
    }
    async function save() {
        setBusy(true); setMessage('');
        try {
            await apiClient.post('/api/knowledge-cards', { errorItemId: error.id, title, subject: error.subject, concept, pitfall, method, grade: error.grade || null, chapter: chapter || null });
            setCards(await apiClient.get<Card[]>('/api/knowledge-cards', { params: { errorItemId: error.id } }));
            setOpen(false); setMessage('知识卡已保存，可在知识库中继续整理和复习。');
        } catch (e) { setMessage(friendlyApiError(e)); }
        finally { setBusy(false); }
    }
    return <section className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-800">错题知识点</h2><p className="mt-1 text-xs text-slate-500">从本题解析整理概念、易错点和方法；保存前请核对内容。</p></div><Button variant="outline" onClick={start}>提炼知识点</Button></div>
        {cards.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{cards.map(card => <Link key={card.id} href={`/knowledge-library/tags?card=${card.id}`} className="rounded-full border border-indigo-200 bg-white px-3 py-1 text-sm text-indigo-600">{card.title}</Link>)}</div>}
        {message && <p role="status" className="mt-3 text-sm text-indigo-700">{message}</p>}
        {open && <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={() => setOpen(false)}><div role="dialog" aria-modal="true" aria-label="提炼知识点" className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">提炼知识点</h2><button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500">关闭</button></div><div className="space-y-4"><label className="block text-sm">知识点名称<Input className="mt-2" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} placeholder="例如：一元二次方程的求根公式" /></label><label className="block text-sm">核心概念<Textarea className="mt-2" value={concept} onChange={e => setConcept(e.target.value)} maxLength={4000} placeholder="用自己的话说明这个知识点" /></label><label className="block text-sm">常见误区<Textarea className="mt-2" value={pitfall} onChange={e => setPitfall(e.target.value)} maxLength={4000} /></label><label className="block text-sm">解题方法<Textarea className="mt-2 min-h-32" value={method} onChange={e => setMethod(e.target.value)} maxLength={4000} /></label><label className="block text-sm">章节 · 选填<Input className="mt-2" value={chapter} onChange={e => setChapter(e.target.value)} maxLength={100} /></label><p className="text-xs text-slate-500">再次保存同科目、同名称的知识点会合并关联错题，并更新卡片内容。</p>{message && <p role="alert" className="text-sm text-red-600">{message}</p>}<Button onClick={save} disabled={busy || !title.trim()}>{busy ? '保存中…' : '确认收录'}</Button></div></div></div>}
    </section>;
}
