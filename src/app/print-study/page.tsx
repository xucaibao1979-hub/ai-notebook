"use client";

import { Suspense, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { hasPrintedChoiceOptions } from '@/lib/print-preview';

/* eslint-disable @next/next/no-img-element -- 打印时保留原题照片尺寸。 */
type Item = { key: string; title: string; questionText: string; questionHtml?: string; isChoiceQuestion?: boolean; image?: string; answerText?: string; answerHtml?: string; analysis: string; tags: string[] };
type Edition = 'student' | 'answer';

function PrintContent() {
    const params = useSearchParams();
    const [items, setItems] = useState<Item[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [count, setCount] = useState(5);
    const [includePhotos, setIncludePhotos] = useState(false);
    const [edition, setEdition] = useState<Edition>('student');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        apiClient.get<Item[]>('/api/print-study?' + params.toString())
            .then(rows => {
                if (!active) return;
                setItems(rows);
                setSelected(new Set(rows.map(row => row.key)));
                setError('');
            })
            .catch(e => {
                if (active) setError(friendlyApiError(e));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [params]);

    function random() {
        const rows = [...items];
        for (let i = rows.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rows[i], rows[j]] = [rows[j], rows[i]];
        }
        setSelected(new Set(rows.slice(0, Math.min(rows.length, Math.max(1, Number.isFinite(count) ? count : 1))).map(row => row.key)));
    }

    function print(version: Edition) {
        flushSync(() => setEdition(version));
        window.print();
    }

    const chosen = items.filter(row => selected.has(row.key));
    const photoOnly = chosen.filter(row => !row.questionHtml?.trim() && !row.questionText.trim());
    const showPhotos = edition === 'answer' && includePhotos;

    return <main className="mx-auto max-w-4xl space-y-5 p-5 print:p-0">
        <section className="space-y-3 rounded-xl border bg-white p-4 print:hidden">
            <h1 className="text-xl font-semibold">错题重做卷 · 打印预览</h1>
            <p className="text-sm text-slate-600">保留列表传入的选题，两版使用同一组选题，无需刷新。学生版不含答案、解析和原题照片；原照片可能含已有作答，仅答案版可选择附带。</p>
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setSelected(new Set(items.map(row => row.key)))}>全选</Button>
                <Button variant="outline" onClick={() => setSelected(new Set())}>清空选择</Button>
                <input aria-label="随机打印题量" type="number" className="h-9 w-20 rounded border px-2" min={1} max={500} value={count} onChange={e => setCount(Number(e.target.value))} />
                <Button variant="outline" onClick={random}>随机选题</Button>
                <label className="text-sm"><input type="checkbox" checked={includePhotos} onChange={e => setIncludePhotos(e.target.checked)} /> 答案版附带原题照片（可能含学生作答）</label>
            </div>
            <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setEdition('student')} aria-pressed={edition === 'student'}>预览学生版</Button>
                <Button variant="outline" onClick={() => setEdition('answer')} aria-pressed={edition === 'answer'}>预览答案版</Button>
                <Button disabled={loading || !!error || !chosen.length || !!photoOnly.length} onClick={() => print('student')}>打印学生版（{chosen.length} 题）</Button>
                <Button disabled={loading || !!error || !chosen.length} onClick={() => print('answer')}>打印答案版（{chosen.length} 题）</Button>
            </div>
            {loading && <p role="status">正在加载选题…</p>}
            {error && <p role="alert" className="text-sm text-red-600">加载选题失败：{error}</p>}
            {!loading && !error && !items.length && <p role="status">没有可打印的题目，请返回列表选择错题。</p>}
            {!loading && !error && !!items.length && !chosen.length && <p role="status">当前未选择题目，请勾选至少一道题后打印。</p>}
            {!!photoOnly.length && <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p>当前选题中有 {photoOnly.length} 道仅有原题照片、没有文字题干。照片可能包含已有作答，学生版不能安全呈现这些题目，因此已暂停学生版打印。请先为题目补充文字题干，或从选题中剔除；答案版仍可打印。</p>
                <p>涉及题目：{photoOnly.map(row => row.title).join('、')}</p>
                <Button variant="outline" onClick={() => setSelected(prev => {
                    const next = new Set(prev);
                    photoOnly.forEach(row => next.delete(row.key));
                    return next;
                })}>从选题中剔除无文字题干题目</Button>
            </div>}
            {!!items.length && <div className="flex flex-wrap gap-3" aria-label="选择打印题目">{items.map((row, index) => <label key={row.key} className="text-sm"><input type="checkbox" checked={selected.has(row.key)} onChange={() => setSelected(prev => {
                const next = new Set(prev);
                if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
                return next;
            })} /> 第 {index + 1} 题 · {row.title}</label>)}</div>}
        </section>
        {!!photoOnly.length && edition === 'student' && <p className="hidden border border-amber-500 p-4 text-center print:block">本组选题含仅有照片的题目，无法安全生成学生版。请返回预览页剔除这些题目或补充文字题干后重试。</p>}
        {!!chosen.length && <div className={`border-b pb-3 text-center print:mb-6 ${photoOnly.length && edition === 'student' ? 'print:hidden' : ''}`}>
            <h2 className="text-2xl font-bold">错题重做卷 · {edition === 'student' ? '学生版' : '答案版'}</h2>
            <p className="text-sm text-slate-600">共 {chosen.length} 题{edition === 'student' ? ' · 选择题在括号内作答，其余题目在题下作答' : ' · 附参考答案与解析'}</p>
        </div>}
        {chosen.map((row, index) => <article key={row.key} className={`break-inside-avoid rounded-xl border bg-white p-5 print:rounded-none print:border-0 print:border-b ${photoOnly.length && edition === 'student' ? 'print:hidden' : ''}`}>
            <h3 className="mb-3 text-base font-semibold">第 {index + 1} 题 · {row.title}</h3>
            {row.questionHtml ? <div className="library-question-content" dangerouslySetInnerHTML={{ __html: row.questionHtml }} /> : row.questionText ? <MarkdownRenderer content={row.questionText} /> : <p className="text-sm text-slate-600">本题仅有原题照片，学生版不附带可能包含已作答内容的照片。</p>}
            {showPhotos && row.image && <figure className="mt-3"><img src={row.image} alt="原题照片（可能含学生作答）" className="max-h-[16cm] max-w-full object-contain" /><figcaption className="text-xs text-slate-500">原题照片（可能包含学生作答）</figcaption></figure>}
            {edition === 'answer' ? <div className="mt-5 space-y-3 border-t pt-3">
                <h4 className="text-sm font-semibold">参考答案与解析</h4>
                {row.answerHtml ? <div className="library-question-content" dangerouslySetInnerHTML={{ __html: row.answerHtml }} /> : <MarkdownRenderer content={row.answerText || '暂无参考答案'} />}
                {row.analysis && <MarkdownRenderer content={row.analysis} />}
            </div> : !(row.isChoiceQuestion || hasPrintedChoiceOptions(row.questionText, row.questionHtml)) && <div className="mt-5 min-h-20 border-b border-dashed" aria-label={`第 ${index + 1} 题作答区`} />}
        </article>)}
    </main>;
}

export default function PrintPage() {
    return <Suspense fallback={<p>正在准备打印预览…</p>}><PrintContent /></Suspense>;
}
