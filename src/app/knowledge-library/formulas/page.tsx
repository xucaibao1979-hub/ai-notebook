'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { KnowledgeNavigation } from '@/components/knowledge-navigation';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { MATH_FORMULAS, MATH_STAGES, MathStage } from '@/lib/math-formulas';
import { formulaLearningNotes } from '@/lib/math-formula-learning';

type HistoryItem = { id: string; questionText: string; answerText: string; analysis: string; createdAt: string; variation: number | null; favorited: boolean };
type StageFilter = MathStage | '全部学段';
type GenerateTarget = 'quick-1' | 'quick-2' | 'practice';
const fieldClass = 'mt-1 w-full rounded-lg border p-2';

function SavedExercise({ item, onFavorite, onDelete }: { item: HistoryItem; onFavorite: () => void; onDelete: () => void }) {
  return <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-7">
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">最近一次 · {new Date(item.createdAt).toLocaleString('zh-CN')}</span><div className="flex gap-3"><button type="button" onClick={onFavorite} className="text-indigo-700">{item.favorited ? '★ 已收藏' : '☆ 收藏'}</button><button type="button" onClick={onDelete} className="text-red-600">删除</button></div></div>
    <div className="overflow-x-auto font-medium"><MarkdownRenderer content={item.questionText} /></div>
    <details className="rounded-lg bg-slate-50 px-3 py-2"><summary className="cursor-pointer font-medium text-indigo-700">查看答案与解析</summary><div className="mt-2 space-y-2 overflow-x-auto"><div><strong>答案：</strong><MarkdownRenderer content={item.answerText || '暂无答案'} /></div><div><strong>解析：</strong><MarkdownRenderer content={item.analysis || '暂无解析'} /></div></div></details>
  </div>;
}

export default function MathFormulaPage() {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<StageFilter>('初中');
  const [grade, setGrade] = useState('全部年级');
  const [level1, setLevel1] = useState('全部领域');
  const [level2, setLevel2] = useState('全部知识点');
  const [selectedId, setSelectedId] = useState(MATH_FORMULAS.find(item => item.stage === '初中')!.id);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busy, setBusy] = useState<Record<GenerateTarget, boolean>>({ 'quick-1': false, 'quick-2': false, practice: false });
  const [messages, setMessages] = useState<Partial<Record<GenerateTarget, string>>>({});
  const formulaIdRef = useRef(selectedId);
  const detailRef = useRef<HTMLElement>(null);
  const stageItems = useMemo(() => MATH_FORMULAS.filter(item => stage === '全部学段' || item.stage === stage), [stage]);
  const grades = [...new Set(stageItems.map(item => item.grade))];
  const gradeItems = stageItems.filter(item => grade === '全部年级' || item.grade === grade);
  const levels1 = [...new Set(gradeItems.map(item => item.level1))];
  const levels2 = [...new Set(gradeItems.filter(item => level1 === '全部领域' || item.level1 === level1).map(item => item.level2))];
  const filtered = gradeItems.filter(item =>
    (level1 === '全部领域' || item.level1 === level1) &&
    (level2 === '全部知识点' || item.level2 === level2) &&
    (!query.trim() || [item.name, item.level1, item.level2, item.latex, item.condition].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  );
  const selected = filtered.find(item => item.id === selectedId) || filtered[0];
  formulaIdRef.current = selected?.id || '';
  const notes = selected ? formulaLearningNotes(selected) : null;

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setHistory([]);
    fetch(`/api/formula-practice?formulaId=${encodeURIComponent(selected.id)}`)
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message); return data; })
      .then(data => { if (active) setHistory(data.items || []); })
      .catch(error => { if (active) setMessages(previous => ({ ...previous, practice: (error as Error).message })); });
    return () => { active = false; };
  }, [selected?.id]);

  async function generate(variation?: 1 | 2) {
    if (!selected) return;
    const target: GenerateTarget = variation ? `quick-${variation}` : 'practice';
    if (busy[target]) return;
    const formulaId = selected.id;
    setBusy(previous => ({ ...previous, [target]: true }));
    setMessages(previous => ({ ...previous, [target]: '正在按公式生成并校验新题，请稍候…' }));
    try {
      const response = await fetch('/api/formula-practice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000), body: JSON.stringify({ formulaId, difficulty, variation }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '出题失败');
      if (formulaIdRef.current === formulaId) {
        setHistory(previous => [data as HistoryItem, ...previous]);
        setMessages(previous => ({ ...previous, [target]: '已生成并保存，可在此处查看题目和解析。' }));
      }
    } catch (error) {
      if (formulaIdRef.current !== formulaId) return;
      if ((error as Error).name === 'TimeoutError') {
        setMessages(previous => ({ ...previous, [target]: '此题等待超时，正在检查是否已保存；可稍后重试。' }));
        fetch(`/api/formula-practice?formulaId=${encodeURIComponent(formulaId)}`).then(response => response.ok ? response.json() : null).then(data => { if (data?.items && formulaIdRef.current === formulaId) setHistory(data.items); }).catch(() => {});
      } else setMessages(previous => ({ ...previous, [target]: (error as Error).message }));
    }
    finally { setBusy(previous => ({ ...previous, [target]: false })); }
  }

  async function changeSaved(item: HistoryItem, action: 'favorite' | 'delete') {
    setMessages(previous => ({ ...previous, practice: '' }));
    try {
      const response = await fetch(`/api/learning/sets/${encodeURIComponent(item.id)}`, { method: action === 'delete' ? 'DELETE' : 'PATCH', ...(action === 'favorite' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorited: !item.favorited }) } : {}) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '操作失败');
      setHistory(previous => action === 'delete' ? previous.filter(row => row.id !== item.id) : previous.map(row => row.id === item.id ? { ...row, favorited: !row.favorited } : row));
    } catch (error) { setMessages(previous => ({ ...previous, practice: (error as Error).message })); }
  }

  function chooseStage(next: StageFilter) {
    setStage(next); setGrade('全部年级'); setLevel1('全部领域'); setLevel2('全部知识点'); setMessages({});
  }
  function chooseFormula(id: string) {
    formulaIdRef.current = id; setSelectedId(id); setMessages({});
    if (window.innerWidth < 1024) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 md:px-8">
    <KnowledgeNavigation />
    <header><h1 className="text-2xl font-semibold text-slate-900">数学公式</h1><p className="mt-1 text-sm text-slate-600">按学段、年级和知识点筛选公式；依次学习原式、两种变式、快解和考题演练。</p><p className="mt-2 text-xs text-slate-500">依据公开课程标准整理常用公式，不对应某本教材的页码。例题为中高考常见题型改编，不标称真实考题出处。</p></header>
    <section aria-label="学段筛选" className="flex flex-wrap gap-2">{(['全部学段', ...MATH_STAGES] as StageFilter[]).map(value => <button key={value} type="button" aria-pressed={stage === value} onClick={() => chooseStage(value)} className={`rounded-xl border px-4 py-2 text-sm ${stage === value ? 'border-indigo-500 bg-indigo-50 font-medium text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>{value === '全部学段' ? value : `${value}数学公式`}<span className="ml-2 text-xs text-slate-400">{value === '全部学段' ? MATH_FORMULAS.length : MATH_FORMULAS.filter(item => item.stage === value).length}</span></button>)}</section>
    <section className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm">搜索公式<input aria-label="搜索公式" value={query} onChange={event => setQuery(event.target.value)} placeholder="名称、表达式或条件" className={fieldClass} /></label><label className="text-sm">年级<select value={grade} onChange={event => { setGrade(event.target.value); setLevel1('全部领域'); setLevel2('全部知识点'); }} className={fieldClass}><option>全部年级</option>{grades.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">一级领域<select value={level1} onChange={event => { setLevel1(event.target.value); setLevel2('全部知识点'); }} className={fieldClass}><option>全部领域</option>{levels1.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-sm">二级知识点<select value={level2} onChange={event => setLevel2(event.target.value)} className={fieldClass}><option>全部知识点</option>{levels2.map(value => <option key={value}>{value}</option>)}</select></label></section>
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]"><aside className="max-h-80 space-y-2 overflow-y-auto rounded-xl border bg-white p-3 lg:max-h-[680px]" aria-label="公式列表"><p className="px-2 py-1 text-xs text-slate-500">匹配 {filtered.length} / {stageItems.length} 条</p>{filtered.map(item => <button key={item.id} type="button" onClick={() => chooseFormula(item.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${selected?.id === item.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><span className="font-medium">{item.name}</span><span className="mt-1 block text-xs text-slate-500">{item.stage} · {item.level1} / {item.level2} · {item.grade}</span></button>)}{!filtered.length && <p className="p-3 text-sm text-slate-500">没有匹配的公式，请调整筛选。</p>}</aside>
      {selected && notes && <section ref={detailRef} className="scroll-mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <div><p className="text-xs font-medium text-indigo-600">{selected.stage} · {selected.level1} / {selected.level2} · {selected.grade}</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{selected.name}</h2></div>
        <section aria-labelledby="formula-detail" className="overflow-hidden rounded-2xl border border-sky-200 bg-sky-50/60">
          <div className="border-b border-sky-200 bg-sky-100/70 px-4 py-3"><h3 id="formula-detail" className="font-semibold text-sky-950">01 · 公式详解</h3></div>
          <div className="space-y-4 p-4 text-sm leading-7 text-slate-700">
            <p>{notes.idea}</p>
            <div className="overflow-x-auto rounded-xl bg-white px-4 py-5"><p className="mb-2 text-xs font-medium text-sky-800">原公式 · {selected.name}</p><MarkdownRenderer content={`$$${selected.latex}$$`} /></div>
            <div className="grid gap-3 xl:grid-cols-2">{notes.variations.map((variant, index) => <div key={index} className="min-w-0 rounded-xl border border-sky-100 bg-white p-4"><p className="font-medium text-sky-900">{variant.title}</p><div className="overflow-x-auto py-2"><MarkdownRenderer content={`$$${variant.expression}$$`} /></div><p className="text-xs text-slate-600">{variant.use}</p></div>)}</div>
            <p><strong>适用条件：</strong>{selected.condition}</p>
          </div>
        </section>
        <section aria-labelledby="formula-quick" className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50/40">
          <div className="border-b border-indigo-200 bg-indigo-100/60 px-4 py-3"><h3 id="formula-quick" className="font-semibold text-indigo-950">02 · 公式快解</h3></div>
          <div className="space-y-4 p-4 text-sm text-slate-700"><ol className="list-decimal space-y-2 pl-5 leading-7">{notes.steps.map(step => <li key={step}>{step}</li>)}</ol>
            {notes.variations.map((variant, index) => { const target = `quick-${index + 1}` as GenerateTarget; const latest = history.find(item => item.variation === index + 1); return <div key={index} className="rounded-xl border border-indigo-100 bg-white p-4 leading-7"><p className="font-medium text-indigo-900">{variant.title} · {selected.stage === '高中' ? '高考' : selected.stage === '初中' ? '中考' : '综合练习'}题型改编</p>{variant.example ? <><p className="mt-2">{variant.example.question}</p><p>快解：{variant.example.working}</p><p className="font-medium text-indigo-700">答案：{variant.example.answer}</p></> : <p className="mt-2 text-slate-600">{variant.use}</p>}<button type="button" disabled={busy[target]} onClick={() => generate(index === 0 ? 1 : 2)} className="mt-2 rounded-lg border border-indigo-200 px-3 py-1.5 text-indigo-700 disabled:opacity-50">{busy[target] ? '正在生成…' : latest ? '重新生成这道变式题' : '生成这道变式题并查看解析'}</button>{messages[target] && <p role="status" className="mt-2 text-sm text-amber-800">{messages[target]}</p>}{latest && <SavedExercise item={latest} onFavorite={() => changeSaved(latest, 'favorite')} onDelete={() => changeSaved(latest, 'delete')} />}</div>; })}
          </div>
        </section>
        <section aria-labelledby="formula-practice" className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40">
          <div className="border-b border-emerald-200 bg-emerald-100/60 px-4 py-3"><h3 id="formula-practice" className="font-semibold text-emerald-950">03 · 考题演练</h3></div>
          <div className="space-y-4 p-4"><p className="text-sm leading-6 text-slate-600">{selected.name}变式的应用：按{selected.stage === '高中' ? '高考' : selected.stage === '初中' ? '中考' : '小学综合练习'}常见题型改编。生成题会校验适用条件、避开历史重复，并保存到练习记录。</p>
            <div className="flex flex-wrap items-end gap-3"><label className="text-sm">难度<select value={difficulty} onChange={event => setDifficulty(event.target.value as typeof difficulty)} className={fieldClass}><option value="easy">基础</option><option value="medium">提高</option><option value="hard">挑战</option></select></label><button disabled={busy.practice} onClick={() => generate()} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm text-white disabled:opacity-50">{busy.practice ? '正在出题…' : '生成考题演练'}</button></div>
            {messages.practice && <p role="status" className="text-sm text-amber-800">{messages.practice}</p>}
            <div className="border-t border-emerald-200 pt-4"><h4 className="font-medium">最近一次考题演练</h4>{history.find(item => item.variation === null) ? (() => { const latest = history.find(item => item.variation === null)!; return <SavedExercise item={latest} onFavorite={() => changeSaved(latest, 'favorite')} onDelete={() => changeSaved(latest, 'delete')} />; })() : <p className="mt-2 text-sm text-slate-500">暂无演练题，生成后会直接显示在这里。</p>}</div>
          </div>
        </section>
        <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-indigo-700 underline">查看对应学段课程标准</a>
      </section>}
    </div>
  </main>;
}
