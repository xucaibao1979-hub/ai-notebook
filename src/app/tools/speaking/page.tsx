"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, Shuffle, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { availableSpeakingPrompts, randomSpeakingPrompt, type SpeakingCategory, type SpeakingPrompt } from '@/lib/speaking-prompts';

export default function SpeakingPage() {
    const [grade, setGrade] = useState(3);
    const [category, setCategory] = useState<SpeakingCategory>('daily');
    const [current, setCurrent] = useState<SpeakingPrompt | null>(null);
    const [notes, setNotes] = useState('');
    const [audioError, setAudioError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/study-units', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
            .then((data: { grade?: unknown } | null) => {
                const label = typeof data?.grade === 'string' ? data.grade : '';
                const match = /^小学([一二三四五六])年级$/.exec(label);
                if (match) setGrade('一二三四五六'.indexOf(match[1]) + 1);
                else if (/^初[一二三]$/.test(label)) setGrade(7 + '一二三'.indexOf(label[1]));
            }).catch(() => {});
        return () => { controller.abort(); if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
    }, []);
    const available = availableSpeakingPrompts(category, grade);
    const selected = current && available.some(item => item.title === current.title) ? current : available[0];
    function next() {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        setCurrent(randomSpeakingPrompt(category, grade, selected?.title));
    }
    function play() {
        if (!selected) return;
        if (!('speechSynthesis' in window)) { setAudioError('当前浏览器不支持语音播放，请看句子自行练习。'); return; }
        setAudioError('');
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(selected.english);
        utterance.lang = 'en-US';
        utterance.rate = grade < 4 ? 0.75 : 0.85;
        window.speechSynthesis.speak(utterance);
    }
    return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-9"><Link href="/tools" className="inline-flex items-center gap-2 text-sm text-indigo-600"><ArrowLeft className="size-4" />返回工具箱</Link>
        <header><h1 className="text-3xl font-bold">口语跟读</h1><p className="mt-2 text-sm text-slate-600">按年级从日常用语、学习用语中随机抽句跟读。浏览器播放示范发音，不录音、不提供 AI 评分或对话。</p></header>
        <section className="space-y-4 rounded-2xl border bg-white p-5"><div className="flex flex-wrap gap-3"><label className="text-sm font-medium">年级<select value={grade} onChange={event => { setGrade(Number(event.target.value)); setCurrent(null); }} className="mt-2 block rounded-lg border bg-white p-2">{Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i < 6 ? `小学${'一二三四五六'[i]}年级` : `初${'一二三'[i - 6]}`}</option>)}</select></label><label className="text-sm font-medium">练习类型<select value={category} onChange={event => { setCategory(event.target.value as SpeakingCategory); setCurrent(null); }} className="mt-2 block rounded-lg border bg-white p-2"><option value="daily">日常用语</option><option value="study">学习用语</option></select></label></div>
            {selected && <div className="space-y-3 rounded-xl bg-indigo-50 p-5"><p className="text-sm font-medium text-indigo-700">{selected.title}</p><p lang="en" className="text-xl leading-9 text-slate-800">{selected.english}</p><p className="text-sm text-slate-600">{selected.chinese}</p></div>}
            <div className="flex flex-wrap gap-2"><Button onClick={next}><Shuffle className="mr-2 size-4" />随机换一句</Button><Button variant="outline" onClick={play}><Volume2 className="mr-2 size-4" />播放示范发音</Button></div>
            {audioError && <p role="status" className="text-sm text-amber-700">{audioError}</p>}
        </section><section className="rounded-2xl border bg-white p-5"><label htmlFor="speaking-notes" className="font-semibold">我的跟读记录</label><textarea id="speaking-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} rows={4} placeholder="记下需要重练的句子和单词……" className="mt-3 w-full rounded-lg border p-3" /><p className="text-xs text-slate-500">练习记录仅在当前页面保留，刷新后不保存。</p></section>
    </main>;
}
