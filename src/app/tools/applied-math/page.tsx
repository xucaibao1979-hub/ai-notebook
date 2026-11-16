'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useToolPracticeSession } from '@/lib/use-tool-practice-session';
import { flushSync } from 'react-dom';
import { PracticePrintSheet, PrintActions, type PrintEdition } from '@/components/practice-print-sheet';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { appliedMathTopics, gradeAppliedMathQuestions, type AppliedMathQuestion } from '@/lib/applied-math';

export default function AppliedMathPage() {
    const practice = useToolPracticeSession('applied-math');
    const restoredRevision = useRef<number | null>(null);
    const latestAnswers = useRef<Record<number, string>>({});
    const [grade, setGrade] = useState(3);
    const [topic, setTopic] = useState('');
    const [count, setCount] = useState(10);
    const [questions, setQuestions] = useState<AppliedMathQuestion[]>([]);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');
    const [printEdition, setPrintEdition] = useState<PrintEdition>('student');
    const [sheetLabel, setSheetLabel] = useState('');
    const [generatedSettings, setGeneratedSettings] = useState('');
    const topics = appliedMathTopics(grade);
    const results = submitted ? gradeAppliedMathQuestions(questions, answers) : [];
    const correct = results.filter(result => result.correct).length;
    const settingsKey = JSON.stringify({ grade, topic, count });
    const settingsChanged = !!questions.length && generatedSettings !== settingsKey;

    useEffect(() => {
        if (!practice.ready || !practice.session || restoredRevision.current !== null) return;
        const saved = practice.session;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled || restoredRevision.current !== null) return;
            restoredRevision.current = saved.revision;
            setGrade(saved.settings.grade);
            setTopic(saved.settings.topic);
            setCount(saved.settings.count);
            setGeneratedSettings(JSON.stringify(saved.settings));
            setSheetLabel(`小学${['一','二','三','四','五','六'][saved.settings.grade - 1]}年级 · ${appliedMathTopics(saved.settings.grade).find(item => item.value === saved.settings.topic)?.label || '随机混合'}`);
            setQuestions(saved.questions);
            latestAnswers.current = saved.answers;
            setAnswers(saved.answers);
            setSubmitted(saved.submitted);
        });
        return () => { cancelled = true; };
    }, [practice.ready, practice.session]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/study-units', { signal: controller.signal })
            .then(response => response.ok ? response.json() : null)
            .then((data: { grade?: unknown } | null) => {
                if (typeof data?.grade !== 'string') return;
                const match = /^小学([一二三四五六])年级$/.exec(data.grade);
                if (match && restoredRevision.current === null) setGrade('一二三四五六'.indexOf(match[1]) + 1);
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);

    async function start() {
        if (!Number.isInteger(count) || count < 1 || count > 50) { setError('题量须为 1 至 50'); return; }
        setError('');
        try {
            const saved = await practice.start({ grade, topic, count });
            restoredRevision.current = saved.revision;
            setQuestions(saved.questions);
            setGeneratedSettings(JSON.stringify(saved.settings));
            setSheetLabel(`小学${['一','二','三','四','五','六'][grade - 1]}年级 · ${topics.find(item => item.value === topic)?.label || '随机混合'}`);
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
        <header className="rounded-3xl bg-indigo-600 p-7 text-white md:p-9">
            <p className="text-sm text-indigo-100">专项练习 · 规则出题，无需 AI 配置</p>
            <h1 className="mt-2 text-3xl font-bold">应用算练习</h1>
            <p className="mt-3 text-sm leading-7 text-indigo-100">读题列式，输入结果后统一核对。题目来自通用年级知识点模板，不代表与你的教材章节精确匹配。</p>
        </header>
        <section className="space-y-4 rounded-2xl border bg-white p-5" aria-label="练习设置">
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">年级
                    <select value={grade} onChange={event => { setGrade(Number(event.target.value)); setTopic(''); }} className="h-10 rounded-lg border border-slate-300 bg-white px-3">
                        {[1, 2, 3, 4, 5, 6].map(value => <option key={value} value={value}>小学{['一', '二', '三', '四', '五', '六'][value - 1]}年级</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">知识点
                    <select value={topic} onChange={event => setTopic(event.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-3">
                        <option value="">随机混合</option>
                        {topics.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">题量（1-50）
                    <input type="number" min={1} max={50} step={1} value={count} onChange={event => setCount(event.target.value === '' ? 0 : Number(event.target.value))} className="h-10 w-28 rounded-lg border border-slate-300 px-3" />
                </label>
                <Button onClick={start} disabled={!practice.ready || practice.saving}><RotateCcw className="mr-2 size-4" />{questions.length ? '重新出题' : '开始练习'}</Button>
            </div>
            {practice.saving && <p role="status" className="text-sm text-indigo-700">正在保存练习…</p>}
            {practice.error && <p role="alert" className="text-sm text-rose-700">自动保存失败：{practice.error}。请保持页面开启，<button type="button" onClick={retrySave} className="underline">重试保存当前答案</button>。</p>}
            {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
            <p className="text-xs text-slate-500">按通用年级模板出题，不使用教材资料；更改设置后重新出题会清空当前答案。旧题与作答会保留到重新出题；设置变更后需重新出题才可打印 A4 学生卷和答案卷。</p>
        </section>
        {settingsChanged && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">设置已变更：下方仍是上一组题，请重新出题后再打印；当前作答仍可完成。</p>}
        {!!questions.length && <PrintActions disabled={settingsChanged} onPrint={print} />}
        {!!questions.length && <section className="space-y-5" aria-labelledby="applied-questions-title">
            <div className="flex items-center justify-between gap-3"><h2 id="applied-questions-title" className="text-xl font-semibold">本次练习 · {questions.length} 题</h2>{submitted && <strong className="text-indigo-700">答对 {correct}/{questions.length} 题</strong>}</div>
            <div className="space-y-3">{questions.map((question, index) => {
                const result = results[index];
                return <div key={question.id} className={`rounded-2xl border bg-white p-5 ${submitted ? result.correct ? 'border-emerald-300' : 'border-amber-300' : 'border-slate-200'}`}>
                    <label htmlFor={`applied-answer-${question.id}`} className="mb-3 block font-medium leading-7 text-slate-800"><span className="mr-2 text-slate-400">{question.id}.</span>{question.prompt}</label>
                    <input id={`applied-answer-${question.id}`} type="text" inputMode="decimal" autoComplete="off" value={answers[question.id] ?? ''} disabled={submitted} onChange={event => changeAnswer(question.id, event.target.value)} className="h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50" placeholder="填写数字答案（不带单位）" />
                    {submitted && <div className={`mt-3 text-sm font-medium ${result.correct ? 'text-emerald-700' : 'text-amber-800'}`}><p>{result.correct ? '答对了' : `正确答案：${question.answer}${result.input ? ` · 你填了 ${result.input}` : ' · 本题未作答'}`}</p><p className="mt-1">参考列式：{question.solution || '暂无列式'}</p></div>}
                </div>;
            })}</div>
            {!submitted ? <Button onClick={submit} disabled={practice.saving}>提交并核对答案</Button> : <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5"><h3 className="font-semibold text-slate-900">本次练习回顾</h3><p className="text-sm text-slate-700">答对 {correct} 题，需再练 {questions.length - correct} 题。</p><Button variant="outline" onClick={start}>再练一组</Button></div>}
        </section>}
        </div>
        {!!questions.length && !settingsChanged && <PracticePrintSheet title="应用算练习" subtitle={sheetLabel} questions={questions} edition={printEdition} kind="applied" />}
    </main>;
}
