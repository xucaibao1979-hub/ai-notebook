"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { poetryForGrade, randomPoetry, type PoetryItem } from '@/lib/poetry-learning';

export default function PoetryPage() {
    const [grade, setGrade] = useState(3);
    const [current, setCurrent] = useState<PoetryItem | null>(null);
    const [answerVisible, setAnswerVisible] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/study-units', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
            .then((data: { grade?: unknown } | null) => {
                const label = typeof data?.grade === 'string' ? data.grade : '';
                const primary = /^小学([一二三四五六])年级$/.exec(label);
                if (primary) setGrade('一二三四五六'.indexOf(primary[1]) + 1);
                else if (/^初[一二三]$/.test(label)) setGrade(7 + '一二三'.indexOf(label[1]));
            }).catch(() => {});
        return () => controller.abort();
    }, []);
    const available = poetryForGrade(grade);
    const poem = current && available.some(item => item.title === current.title) ? current : available[0];
    function next() {
        setCurrent(randomPoetry(grade, poem?.title));
        setAnswerVisible(false);
    }
    return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-9"><Link href="/tools" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="size-4" />返回工具箱</Link>
        <header><p className="text-sm text-amber-700">诗词学习 · 文字版</p><h1 className="mt-1 text-3xl font-bold">诗词山河</h1><p className="mt-2 text-sm leading-6 text-slate-600">按年级读一首诗、观察意象，再回答一个小问题。当前是诗词文字学习，不含地理地图、诗人路线或教材原文对照。</p></header>
        <section className="rounded-2xl border bg-white p-5"><label className="text-sm font-medium">年级<select value={grade} onChange={event => { setGrade(Number(event.target.value)); setCurrent(null); setAnswerVisible(false); }} className="ml-3 rounded-lg border bg-white p-2">{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i < 6 ? `小学${'一二三四五六'[i]}年级` : `初${'一二三'[i - 6]}`}</option>)}</select></label></section>
        {poem && <article className="space-y-6 rounded-3xl border border-amber-100 bg-[#fffdf7] p-6 shadow-sm sm:p-9"><header className="text-center"><h2 className="text-2xl font-bold text-slate-900">{poem.title}</h2><p className="mt-2 text-sm text-slate-500">{poem.dynasty} · {poem.author}</p></header><div className="space-y-2 text-center text-lg leading-10 text-slate-800">{poem.text.map(line => <p key={line}>{line}</p>)}</div><div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><strong>阅读提示：</strong>{poem.focus}</div><div className="space-y-3 border-t pt-4"><p className="font-medium">想一想：{poem.question}</p><Button variant="outline" onClick={() => setAnswerVisible(true)}>查看参考回答</Button>{answerVisible && <p role="status" className="text-sm text-emerald-800">参考回答：{poem.answer}</p>}</div></article>}
        <Button onClick={next}><Shuffle className="mr-2 size-4" />随机换一首</Button><p className="text-xs text-slate-500">收录的是精选公版古诗词；解析提示与问题为本站整理，不代表任何教材的章节顺序。</p>
    </main>;
}
