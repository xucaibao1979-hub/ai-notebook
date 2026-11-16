"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { buildWritingPlan, writingStats } from '@/lib/writing-coach';
import { Button } from '@/components/ui/button';

type Genre = 'narrative' | 'expository' | 'argument';

export default function WritingPage() {
    const [topic, setTopic] = useState('');
    const [unit, setUnit] = useState('');
    const [genre, setGenre] = useState<Genre>('narrative');
    const [draft, setDraft] = useState('');
    const [showPlan, setShowPlan] = useState(false);
    const plan = useMemo(() => showPlan && topic.trim() ? buildWritingPlan(topic, genre, unit) : null, [showPlan, topic, genre, unit]);
    const stats = writingStats(draft);
    return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-9">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="size-4" />返回工具箱</Link>
        <header><h1 className="text-3xl font-bold">写作构思助手</h1><p className="mt-2 text-sm text-slate-600">根据题目生成写作提纲和检查清单；你自己完成作文。当前为本地规则引导，不是 AI 自动写作文。</p></header>
        <section className="space-y-4 rounded-2xl border bg-white p-5"><label className="block text-sm font-medium">作文题目<input value={topic} maxLength={100} onChange={event => { setTopic(event.target.value); setShowPlan(false); }} placeholder="例如：一次难忘的经历" className="mt-2 w-full rounded-lg border p-3" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">文章类型<select value={genre} onChange={event => { setGenre(event.target.value as Genre); setShowPlan(false); }} className="mt-2 block w-full rounded-lg border p-3"><option value="narrative">记叙文</option><option value="expository">说明文</option><option value="argument">议论文</option></select></label><label className="text-sm font-medium">单元主题（可选）<input value={unit} maxLength={50} onChange={event => { setUnit(event.target.value); setShowPlan(false); }} placeholder="例如：观察生活" className="mt-2 block w-full rounded-lg border p-3" /></label></div>
            <Button disabled={!topic.trim()} onClick={() => setShowPlan(true)}>生成写作提纲</Button>
        </section>
        {plan && <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50 p-5" aria-label="写作提纲"><h2 className="text-xl font-semibold">动笔前，想一想</h2><p><strong>开头：</strong>{plan.opening}</p><div><strong>正文：</strong><ol className="mt-2 list-inside list-decimal space-y-2">{plan.body.map(line => <li key={line}>{line}</li>)}</ol></div><p><strong>结尾：</strong>{plan.ending}</p><h3 className="font-semibold">写完自查</h3><ul className="list-inside list-disc space-y-1">{plan.checklist.map(item => <li key={item}>{item}</li>)}</ul></section>}
        <section className="rounded-2xl border bg-white p-5"><label htmlFor="writing-draft" className="block font-semibold">我的草稿</label><textarea id="writing-draft" value={draft} maxLength={10000} onChange={event => setDraft(event.target.value)} rows={12} placeholder="在这里写自己的作文……" className="mt-3 w-full rounded-xl border p-3 leading-7" /><p className="mt-2 text-sm text-slate-500">{stats.length} 字 · {stats.paragraphs} 段。本页不会自动保存，请离开前复制草稿。</p></section>
    </main>;
}
