'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { KnowledgeNavigation } from '@/components/knowledge-navigation';
import type { DiagnosisEdge, DiagnosisNode, DiagnosisState } from '@/lib/knowledge-diagnosis';
import type { LearningExercise, LearningSetResponse } from '@/lib/learning';
import { TextbookSourcePanel } from '@/components/textbook-source-panel';
import { DiagnosisEvidencePanel } from '@/components/diagnosis-evidence-panel';
import Link from 'next/link';

type Summary = { weak: string[]; shaky: string[]; mastered: string[]; roots: string[]; path: string[]; unfinished: boolean };
type History = { id: string; subject: string; mode: string; targetIds: string[]; createdAt: string; summary: Summary };
type Detail = { id: string; subject: string; mode: string; targetIds: string[]; createdAt: string; state: DiagnosisState; summary: Summary };

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || '操作失败');
  return data;
}

export default function DiagnosisPage() { return <Suspense fallback={<main className="p-8 text-sm text-slate-500">正在加载知识诊断…</main>}><DiagnosisContent /></Suspense>; }

function DiagnosisContent() {
  const params = useSearchParams();
  const [nodes, setNodes] = useState<DiagnosisNode[]>([]);
  const [edges, setEdges] = useState<DiagnosisEdge[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [subject, setSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [volume, setVolume] = useState('');
  const [chapter, setChapter] = useState('');
  const [topicId, setTopicId] = useState('');
  const [prerequisiteId, setPrerequisiteId] = useState('');
  const [strength, setStrength] = useState<'hard' | 'soft'>('hard');
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [question, setQuestion] = useState<LearningExercise | null>(null);
  const [setId, setSetId] = useState('');
  const [graded, setGraded] = useState<boolean | null>(null);
  const [choice, setChoice] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pathId, setPathId] = useState('');
  const name = useCallback((id: string) => nodes.find(node => node.id === id)?.term || '已移除的知识点', [nodes]);
  const refresh = useCallback(async () => {
    const data = await request('/api/diagnosis');
    setNodes(data.nodes); setEdges(data.edges); setHistory(data.history);
    setSubject(old => old || params.get('subject') || data.nodes[0]?.subject || '');
    setTopicId(old => old || params.get('topic') || '');
  }, [params]);
  useEffect(() => { refresh().catch(error => setMessage(error.message)); }, [refresh]);
  const subjects = [...new Set(nodes.map(node => node.subject))];
  const scope = nodes.filter(node => node.subject === subject);
  const grades = [...new Set(scope.map(node => node.grade))];
  const byGrade = scope.filter(node => !grade || node.grade === grade);
  const volumes = [...new Set(byGrade.map(node => node.volume))];
  const byVolume = byGrade.filter(node => !volume || node.volume === volume);
  const chapters = [...new Set(byVolume.map(node => node.chapter))];
  const filtered = byVolume.filter(node => !chapter || node.chapter === chapter);
  const selected = nodes.find(node => node.id === topicId);
  const directParents = edges.filter(edge => edge.topicId === topicId);
  const directChildren = edges.filter(edge => edge.prerequisiteId === topicId);
  const current = nodes.find(node => node.id === detail?.state.currentId);
  const why = current && detail?.state.answers.length ? edges.find(edge => edge.prerequisiteId === current.id && detail.state.status[edge.topicId] === 'weak') : null;
  const exportData = useMemo(() => detail && { generatedAt: new Date().toISOString(), subject: detail.subject, targets: detail.targetIds.map(name), results: detail.summary, answers: detail.state.answers.map(answer => ({ ...answer, topic: name(answer.topicId) })), path: detail.summary.path.map(name), disclaimer: '诊断基于当前教材知识点及手动审核的先修关系；自评结果仅供学习参考。' }, [detail, name]);
  const loadDetail = async (id: string) => { const data = await request(`/api/diagnosis?id=${encodeURIComponent(id)}`); setDetail(data.session); setPathId(''); setQuestion(null); setSetId(''); setGraded(null); setChoice(''); setRevealed(false); setMessage(''); };
  const run = async (ids: string[], mode: 'target' | 'screen') => { setBusy(true); try { const data = await request('/api/diagnosis', { method: 'POST', body: JSON.stringify({ action: 'start', targetIds: ids, mode }) }); await loadDetail(data.id); await refresh(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const generate = async () => {
    if (!current) return;
    setBusy(true); setMessage('');
    try {
      const data = await request('/api/learning/sets', { method: 'POST', body: JSON.stringify({ mode: 'ai', source: 'ai', subject: current.subject, grade: current.grade, count: 1, knowledgePoint: current.term, prompt: `针对“${current.term}”生成一道可独立作答的题，结合${current.chapter}的学习内容，不要求查看教材原文。`, difficulty: 'medium' }) }) as LearningSetResponse;
      if (!data.questions?.[0]) throw new Error('没有生成有效题目');
      setQuestion(data.questions[0]); setSetId(data.id); setGraded(null); setRevealed(false); setChoice('');
    } catch (error) { setMessage(`${(error as Error).message}。可以使用知识点自述题继续诊断。`); setSetId(''); setQuestion({ questionText: `请解释“${current.term}”并举一个例子。`, answerText: current.meaning || '请参照已核对的教材知识点自行核对。', subject: current.subject, knowledgePoints: [current.term], difficulty: 'medium', provenance: { name: '知识点自述' } }); }
    finally { setBusy(false); }
  };
  const reveal = async () => {
    if (!question || !choice.trim()) return;
    if (!setId) { setRevealed(true); return; }
    setBusy(true);
    try {
      const result = await request('/api/learning/answer', { method: 'POST', body: JSON.stringify({ setId, index: 0, action: 'submit', userAnswer: choice }) });
      setQuestion({ ...question, answerText: result.answerText, analysis: result.analysis, answerHtml: result.answerHtml });
      setGraded(result.record?.isCorrect ?? null); setRevealed(true);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  };
  const submit = async (correct: boolean) => {
    if (!detail || !current || !question) return;
    setBusy(true);
    try { if (setId && graded === null) await request('/api/learning/answer', { method: 'POST', body: JSON.stringify({ setId, index: 0, action: 'assess', userAnswer: choice, isCorrect: correct }) }); await request('/api/diagnosis', { method: 'POST', body: JSON.stringify({ action: 'answer', id: detail.id, topicId: current.id, correct, question: question.questionText, ...(setId ? { setId } : {}) }) }); await loadDetail(detail.id); await refresh(); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const addEdge = async () => {
    setBusy(true); try { await request('/api/diagnosis', { method: 'POST', body: JSON.stringify({ action: 'addEdge', topicId, prerequisiteId, strength, reason }) }); await refresh(); setReason(''); setPrerequisiteId(''); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const removeEdge = async (id: string) => { try { await request(`/api/diagnosis?edgeId=${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh(); } catch (error) { setMessage((error as Error).message); } };
  const createPath = async () => { if (!detail) return; setBusy(true); try { const data = await request('/api/learning-paths', { method: 'POST', body: JSON.stringify({ diagnosisSessionId: detail.id }) }); setPathId(data.id); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } };
  const download = () => { if (!exportData) return; const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `知识诊断-${detail?.subject}-${detail?.id}.json`; link.click(); URL.revokeObjectURL(url); };
  const shareImage = () => {
    if (!detail) return;
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 650;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#f8fafc'; context.fillRect(0, 0, 1000, 650);
    context.fillStyle = '#0f172a'; context.font = 'bold 38px sans-serif'; context.fillText(`${detail.subject}知识诊断`, 52, 75);
    context.font = '21px sans-serif'; context.fillStyle = '#475569'; context.fillText(new Date(detail.createdAt).toLocaleString('zh-CN'), 52, 115);
    let y = 185;
    for (const [label, ids] of [['薄弱根因', detail.summary.roots], ['掌握不稳', detail.summary.shaky], ['学习顺序', detail.summary.path]] as const) {
      context.fillStyle = '#4338ca'; context.font = 'bold 27px sans-serif'; context.fillText(label, 52, y); y += 35;
      context.fillStyle = '#334155'; context.font = '21px sans-serif';
      const content = ids.map(name).join(' → ') || '暂无';
      for (let i = 0; i < content.length && y < 590; i += 34) { context.fillText(content.slice(i, i + 34), 52, y); y += 29; }
      y += 22;
    }
    context.fillStyle = '#64748b'; context.font = '16px sans-serif'; context.fillText('基于当前教材知识点与已审核先修关系；自评结果仅供学习参考。', 52, 620);
    canvas.toBlob(async blob => { if (!blob) return; const file = new File([blob], `知识诊断-${detail.id}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: '知识诊断结果' }); return; } catch { /* 分享取消时提供下载 */ } }
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = file.name; link.click(); URL.revokeObjectURL(url);
    }, 'image/png');
  };
  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-8 md:px-8 print:max-w-none"><div className="print:hidden"><KnowledgeNavigation /></div><header><h1 className="text-2xl font-semibold text-slate-900">知识诊断</h1><p className="mt-1 text-sm text-slate-600">选择知识点，答错后再确认一次；连续答错时沿已审核的先修关系回溯，并给出学习顺序。</p></header>
    {message && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden"><h2 className="font-semibold">筛选知识点</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([[subject, setSubject, subjects, '科目'], [grade, setGrade, grades, '年级'], [volume, setVolume, volumes, '册别'], [chapter, setChapter, chapters, '章节']] as const).map(([value, setter, options, label]) => <label key={label} className="text-sm text-slate-600">{label}<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900" value={value} onChange={event => { setter(event.target.value); if (label === '科目') { setGrade(''); setVolume(''); setChapter(''); setTopicId(''); } else if (label === '年级') { setVolume(''); setChapter(''); setTopicId(''); } else if (label === '册别') { setChapter(''); setTopicId(''); } }}><option value="">全部</option>{options.map(option => <option key={option} value={option}>{option || '未标注'}</option>)}</select></label>)}</div><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-sm text-slate-600">诊断知识点<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900" value={topicId} onChange={event => setTopicId(event.target.value)}><option value="">请选择</option>{filtered.map(node => <option key={node.id} value={node.id}>{node.chapter} · {node.term}</option>)}</select></label><button disabled={!topicId || busy} onClick={() => run([topicId], 'target')} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40">诊断当前知识点</button><button disabled={!filtered.length || busy} onClick={() => run(filtered.slice(0, 30).map(node => node.id), 'screen')} className="rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-700 disabled:opacity-40">摸底当前范围（最多 30 点）</button></div>{!nodes.length && <p className="mt-3 text-sm text-slate-500">暂无教材知识点，请先在科目设置中添加并核对目录及知识点。</p>}</section>
    {selected && <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden"><h2 className="font-semibold">局部先修图谱：{selected.term}</h2><p className="mt-1 text-xs text-slate-500">只显示直接相邻关系。实线表示硬先修，虚线表示软先修；关系需要自行审核。</p><div className="mt-4 grid gap-4 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-medium">先学这些</h3>{directParents.length ? directParents.map(edge => <div key={edge.id} className={`mt-2 border-l-2 pl-2 text-sm ${edge.strength === 'soft' ? 'border-dashed border-sky-400' : 'border-indigo-500'}`}><b>{name(edge.prerequisiteId)}</b> · {edge.strength === 'hard' ? '硬先修' : '软先修'}<p className="text-slate-500">{edge.reason}</p><button className="text-red-600" onClick={() => removeEdge(edge.id)}>删除关系</button></div>) : <p className="mt-2 text-sm text-slate-500">暂无已审核先修关系</p>}</div><div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm"><h3 className="font-semibold">当前知识点</h3><p className="mt-2">{selected.term}</p><p className="mt-2 text-slate-600">{selected.meaning}</p></div><div className="rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-medium">后续应用</h3>{directChildren.length ? directChildren.map(edge => <p key={edge.id} className="mt-2 text-sm">{name(edge.topicId)}</p>) : <p className="mt-2 text-sm text-slate-500">暂无后续关系</p>}</div></div><details className="mt-4 text-sm"><summary className="cursor-pointer text-indigo-700">添加或修改先修关系</summary><div className="mt-3 flex flex-wrap items-end gap-2"><select value={prerequisiteId} onChange={event => setPrerequisiteId(event.target.value)} className="rounded-lg border p-2"><option value="">选择前置知识点</option>{scope.filter(node => node.id !== topicId).map(node => <option key={node.id} value={node.id}>{node.term}</option>)}</select><select value={strength} onChange={event => setStrength(event.target.value as 'hard' | 'soft')} className="rounded-lg border p-2"><option value="hard">硬先修</option><option value="soft">软先修</option></select><input className="rounded-lg border p-2" value={reason} onChange={event => setReason(event.target.value)} placeholder="依据或教学说明（建议填写）" /><button disabled={!prerequisiteId || busy} onClick={addEdge} className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40">保存关系</button></div></details></section>}
    {selected && <TextbookSourcePanel node={selected} />}
    {detail && <section className="rounded-2xl border border-indigo-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{detail.subject} · {detail.mode === 'target' ? '前置诊断' : '范围摸底'}</h2><span className="text-sm text-slate-500">已答 {detail.state.answers.length} 题 · {new Date(detail.createdAt).toLocaleString('zh-CN')}</span></div>{current ? <div className="mt-4 space-y-3"><p className="text-sm text-slate-600">当前：<b>{current.term}</b>。{why ? `前一步“${name(why.topicId)}”连续答错，因此检查其${why.strength === 'hard' ? '硬' : '软'}先修知识。${why.reason}` : '先确认当前知识点掌握情况。'}</p>{!question ? <button disabled={busy} onClick={generate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? '正在出题…' : '生成当前知识点题目'}</button> : <div className="rounded-xl bg-slate-50 p-4"><p className="whitespace-pre-wrap font-medium">{question.questionText}</p>{question.options?.length ? <div className="mt-3 grid gap-2">{question.options.map((option, index) => <label key={index} className="flex items-start gap-2 text-sm"><input type="radio" name="diagnosis-answer" value={'ABCD'[index]} checked={choice === 'ABCD'[index]} onChange={event => setChoice(event.target.value)} />{option}</label>)}</div> : <textarea aria-label="我的答案" className="mt-3 w-full rounded-lg border p-2 text-sm" placeholder="先写下你的解答，再查看参考答案" value={choice} onChange={event => setChoice(event.target.value)} />}{!revealed ? <button disabled={!choice.trim() || busy} onClick={reveal} className="mt-3 rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700 disabled:opacity-40">查看答案并核对</button> : <div className="mt-3 space-y-2 text-sm"><p>参考答案：{question.answerText || '请结合解析核对'}</p>{question.analysis && <p className="text-slate-600">解析：{question.analysis}</p>}{graded !== null && <p className="font-medium">你的选择：{choice} · {graded ? '正确' : '错误'}</p>}<div className="flex gap-2"><button disabled={busy || graded === false} onClick={() => submit(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-40">{graded !== null ? '记录正确' : '我答对了'}</button><button disabled={busy || graded === true} onClick={() => submit(false)} className="rounded-lg bg-amber-600 px-4 py-2 text-white disabled:opacity-40">{graded !== null ? '记录错误' : '我答错了'}</button></div>{graded === null && <p className="text-xs text-slate-500">开放题由本人核对，结果属于自评。</p>}</div>}</div>}</div> : <div className="mt-4"><p className="font-semibold">诊断已结束</p><p className="mt-1 text-sm text-slate-600">连续答错标记为薄弱；答错后答对标记为不稳。未建立先修关系的知识点无法继续回溯。</p></div>}<div className="mt-5 grid gap-3 md:grid-cols-3">{([['薄弱根因', detail.summary.roots], ['薄弱知识点', detail.summary.weak], ['掌握不稳', detail.summary.shaky]] as const).map(([label, ids]) => <div key={label} className="rounded-xl border p-3"><h3 className="font-medium">{label} · {ids.length}</h3><p className="mt-2 text-sm text-slate-600">{ids.map(name).join('、') || '暂无'}</p></div>)}</div><div className="mt-4 rounded-xl bg-indigo-50 p-4"><h3 className="font-medium">建议学习顺序</h3><ol className="mt-2 list-inside list-decimal text-sm">{detail.summary.path.length ? detail.summary.path.map(id => <li key={id}>{name(id)} · {detail.summary.weak.includes(id) ? '先补基础' : '再巩固'}</li>) : <li>当前没有检出的薄弱点，可继续筛查其他知识点。</li>}</ol></div><div className="mt-4 flex flex-wrap gap-2 print:hidden"><button onClick={() => run(detail.summary.path.length ? detail.summary.path : detail.targetIds, 'target')} disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-40">盲区再测</button><button disabled={busy || !!detail.state.currentId || !detail.state.answers.length} onClick={createPath} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm text-indigo-700">建立学习路径</button>{pathId && <Link href="/knowledge-library/paths" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">打开学习路径</Link>}<button onClick={shareImage} className="rounded-lg border px-4 py-2 text-sm">分享 / 下载图片</button><button onClick={download} className="rounded-lg border px-4 py-2 text-sm">导出 JSON</button><button onClick={() => window.print()} className="rounded-lg border px-4 py-2 text-sm">打印 / 保存 PDF</button></div><DiagnosisEvidencePanel id={detail.id} state={detail.state} nodes={nodes} edges={edges} onChanged={() => loadDetail(detail.id)} /></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden"><h2 className="font-semibold">学习档案</h2><p className="mt-1 text-xs text-slate-500">记录保存在本机应用数据库。需要运行本地服务才能查看。</p><div className="mt-3 space-y-2">{history.length ? history.map(item => <button key={item.id} onClick={() => loadDetail(item.id).catch(error => setMessage(error.message))} className="flex w-full flex-wrap justify-between gap-2 rounded-lg border p-3 text-left text-sm hover:bg-slate-50"><span>{item.subject} · {item.mode === 'target' ? '前置诊断' : '范围摸底'} · {item.targetIds.slice(0, 3).map(name).join('、')}</span><span className="text-slate-500">薄弱 {item.summary.weak.length} · 不稳 {item.summary.shaky.length} · {new Date(item.createdAt).toLocaleString('zh-CN')}</span></button>) : <p className="text-sm text-slate-500">暂无诊断记录</p>}</div></section>
  </main>;
}
