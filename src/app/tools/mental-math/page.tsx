"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useToolPracticeSession } from '@/lib/use-tool-practice-session';
import { flushSync } from 'react-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { PracticePrintSheet, PrintActions, type PrintEdition } from '@/components/practice-print-sheet';
import { Button } from '@/components/ui/button';
import { gradeMathQuestions, type MathDifficulty, type MathMode, type MathQuestion } from '@/lib/mental-math';

const modes: { value: MathMode; label: string }[] = [
    { value: 'add-sub', label: '加减法（含变式）' },
    { value: 'multiply', label: '乘法（含变式）' },
    { value: 'divide', label: '整除练习' },
    { value: 'mixed', label: '混合练习' },
];

export default function MentalMathPage() {
    const practice = useToolPracticeSession('mental-math');
    const restoredRevision = useRef<number | null>(null);
    const latestAnswers = useRef<Record<number, string>>({});
    const [mode, setMode] = useState<MathMode>('mixed');
    const [difficulty, setDifficulty] = useState<MathDifficulty>('standard');
    const [grade, setGrade] = useState<number | null>(null);
    const [gradeTip, setGradeTip] = useState('');
    const [count, setCount] = useState(10);
    const [error, setError] = useState('');
    const [printEdition, setPrintEdition] = useState<PrintEdition>('student');
    const [sheetLabel, setSheetLabel] = useState('');
    const [generatedSettings, setGeneratedSettings] = useState('');
    const [questions, setQuestions] = useState<MathQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [submitted, setSubmitted] = useState(false);
    const results = submitted ? gradeMathQuestions(questions, answers) : [];
    const correct = results.filter(row => row.correct).length;
    const settingsKey = JSON.stringify({ mode, difficulty, count });
    const settingsChanged = !!questions.length && generatedSettings !== settingsKey;

    useEffect(() => {
        if (!practice.ready || !practice.session || restoredRevision.current !== null) return;
        const saved = practice.session;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled || restoredRevision.current !== null) return;
            restoredRevision.current = saved.revision;
            setMode(saved.settings.mode);
            setDifficulty(saved.settings.difficulty);
            setCount(saved.settings.count);
            setGeneratedSettings(JSON.stringify(saved.settings));
            setSheetLabel(`${modes.find(item => item.value === saved.settings.mode)?.label} · ${saved.settings.difficulty === 'basic' ? '基础' : saved.settings.difficulty === 'standard' ? '进阶' : '挑战'}`);
            setQuestions(saved.questions);
            latestAnswers.current = saved.answers;
            setAnswers(saved.answers);
            setSubmitted(saved.submitted);
        });
        return () => { cancelled = true; };
    }, [practice.ready, practice.session]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/study-units', { signal: controller.signal }).then(response => response.ok ? response.json() : null)
            .then((data: { grade?: unknown } | null) => {
                const label = typeof data?.grade === 'string' ? data.grade : '';
                const match = /^小学([一二三四五六])年级$/.exec(label);
                if (match) {
                    const level = '一二三四五六'.indexOf(match[1]) + 1;
                    setGrade(level);
                    if (restoredRevision.current === null) setDifficulty(level <= 2 ? 'basic' : level <= 4 ? 'standard' : 'challenge');
                    setGradeTip(`已按${label}推荐难度，可手动调整`);
                } else if (label) {
                    setGrade(7);
                    if (restoredRevision.current === null) setDifficulty('challenge');
                    setGradeTip(`${label}：当前提供挑战难度与基础运算复习，不覆盖全部本年级知识点`);
                } else setGradeTip('未设置年级，默认进阶难度；可手动选择');
            }).catch(() => { if (!controller.signal.aborted) setGradeTip('年级读取失败，可手动选择难度'); });
        return () => controller.abort();
    }, []);

    async function start() {
        if (!Number.isInteger(count) || count < 1 || count > 50) { setError('题数须为 1 至 50'); return; }
        const effectiveDifficulty = grade !== null && grade >= 5 && difficulty === 'basic' ? 'standard' : difficulty;
        setError('');
        try {
            const saved = await practice.start({ mode, difficulty: effectiveDifficulty, count });
            restoredRevision.current = saved.revision;
            setQuestions(saved.questions);
            setGeneratedSettings(JSON.stringify(saved.settings));
            setSheetLabel(`${modes.find(item => item.value === mode)?.label} · ${effectiveDifficulty === 'basic' ? '基础' : effectiveDifficulty === 'standard' ? '进阶' : '挑战'}`);
            latestAnswers.current = {};
            setAnswers({});
            setSubmitted(false);
        } catch (cause) { setError(cause instanceof Error ? cause.message : '出题失败'); }
    }

    function changeAnswer(id: number, value: string) {
        const next = { ...latestAnswers.current, [id]: value };
        latestAnswers.current = next;
        setAnswers(next);
        void practice.save(next, false).catch(() => {});
    }

    async function submit() {
        try { await practice.save(latestAnswers.current, true); setSubmitted(true); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '提交失败'); }
    }

    async function retrySave() {
        try {
            const saved = await practice.retry(latestAnswers.current, submitted);
            if (saved?.submitted) setSubmitted(true);
            setError('');
        } catch (cause) { setError(cause instanceof Error ? cause.message : '重试失败'); }
    }

    function print(edition: PrintEdition) {
        if (settingsChanged || !questions.length) return;
        flushSync(() => setPrintEdition(edition));
        window.print();
    }

    return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8 md:px-9 print:m-0 print:max-w-none print:p-0">
        <div className="practice-interactive contents"><Link href="/tools" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"><ArrowLeft className="size-4" />返回学习工具箱</Link>
        <header className="rounded-3xl bg-indigo-600 p-7 text-white md:p-9"><p className="text-sm text-indigo-100">专项练习 · 无需 AI 配置</p><h1 className="mt-2 text-3xl font-bold">口算练习</h1><p className="mt-3 text-sm leading-7 text-indigo-100">选择题型，独立完成，再一次性核对结果。练错的题会列在本次练习结果中。</p></header>
        <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="练习设置">
            <div className="flex flex-wrap items-end gap-4"><label className="flex flex-col gap-1 text-sm font-medium text-slate-700">题型<select value={mode} onChange={event => setMode(event.target.value as MathMode)} className="h-10 rounded-lg border border-slate-300 bg-white px-3">{modes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="flex flex-col gap-1 text-sm font-medium text-slate-700">难度<select value={difficulty} onChange={event => setDifficulty(event.target.value as MathDifficulty)} className="h-10 rounded-lg border border-slate-300 bg-white px-3"><option value="basic" disabled={grade !== null && grade >= 5}>基础{grade !== null && grade >= 5 ? '（高年级不可选）' : ''}</option><option value="standard">进阶</option><option value="challenge">挑战</option></select></label><label className="flex flex-col gap-1 text-sm font-medium text-slate-700">生成题数（1-50）<input type="number" min={1} max={50} step={1} value={count} onChange={event => setCount(event.target.value === '' ? 0 : Number(event.target.value))} className="h-10 w-32 rounded-lg border border-slate-300 bg-white px-3" /></label><Button onClick={start} disabled={!practice.ready || practice.saving}><RotateCcw className="mr-2 size-4" />{questions.length ? '重新出题' : '开始练习'}</Button></div>
            {practice.saving && <p role="status" className="text-sm text-indigo-700">正在保存练习…</p>}
            {practice.error && <p role="alert" className="text-sm text-red-700">自动保存失败：{practice.error}。请保持页面开启，<button type="button" onClick={retrySave} className="underline">重试保存当前答案</button>。</p>}
            {gradeTip && <p role="status" className="text-sm text-indigo-700">{gradeTip}</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <p className="text-xs text-slate-500">基础：50 内加减、九九乘除；进阶/挑战：随机加入小数与填空变式（小数最多两位），挑战还包含较大数及三数混算。更改设置后需重新出题才可打印；旧题及作答会保留至重新出题。</p>
        </section>
        {settingsChanged && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">设置已变更：下方仍是上一组题，请重新出题后再打印；当前作答仍可完成。</p>}
        {!!questions.length && <PrintActions disabled={settingsChanged} onPrint={print} />}
        {!!questions.length && <section className="space-y-5" aria-labelledby="questions-title">
            <div className="flex items-center justify-between"><h2 id="questions-title" className="text-xl font-semibold">本次练习 · {questions.length} 题</h2>{submitted && <strong className="text-indigo-700">答对 {correct}/{questions.length} 题</strong>}</div>
            <div className="grid gap-3 sm:grid-cols-2">{questions.map((question, index) => {
                const result = results[index];
                return <div key={question.id} className={`rounded-2xl border bg-white p-4 ${submitted ? result.correct ? 'border-emerald-300' : 'border-amber-300' : 'border-slate-200'}`}>
                    <label htmlFor={`math-answer-${question.id}`} className="mb-3 block text-lg font-semibold text-slate-800"><span className="mr-3 text-sm text-slate-400">{question.id}.</span>{question.prompt}{question.prompt.includes('□') ? '' : ' = ?'}</label>
                    <input id={`math-answer-${question.id}`} type="text" inputMode="decimal" pattern="[0-9]*[.]?[0-9]*" autoComplete="off" value={answers[question.id] ?? ''} disabled={submitted} onChange={event => changeAnswer(question.id, event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 text-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" placeholder="写出答案" />
                    {submitted && <p className={`mt-3 text-sm font-medium ${result.correct ? 'text-emerald-700' : 'text-amber-800'}`}>{result.correct ? '答对了' : `正确答案：${question.answer}${result.input ? ` · 你填了 ${result.input}` : ' · 本题未作答'}`}</p>}
                </div>;
            })}</div>
            {!submitted ? <Button onClick={submit} disabled={practice.saving}>提交并核对答案</Button> : <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><h3 className="font-semibold text-slate-900">本次练习回顾</h3><p className="text-sm text-slate-700">答对 {correct} 题，需再练 {questions.length - correct} 题。</p>{correct < questions.length && <ul className="list-inside list-disc text-sm text-slate-700">{results.filter(row => !row.correct).map(row => <li key={row.question.id}>{row.question.prompt} = {row.question.answer}</li>)}</ul>}<Button variant="outline" onClick={() => start()}>再练一组</Button></div>}
        </section>}
        </div>
        {!!questions.length && !settingsChanged && <PracticePrintSheet title="口算练习" subtitle={sheetLabel} questions={questions} edition={printEdition} kind="mental" />}
    </main>;
}
