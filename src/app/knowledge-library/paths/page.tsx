'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { KnowledgeNavigation } from '@/components/knowledge-navigation';
import type { DiagnosisNode } from '@/lib/knowledge-diagnosis';
import type { PathState } from '@/lib/learning-path';

type Path = { id: string; diagnosisSessionId: string; state: PathState; createdAt: string; updatedAt: string };
const labels = { foundation: '补前置知识', example: '学例题', practice: '做 3 题', retest: '再测' };

export default function LearningPathsPage() {
  const [items, setItems] = useState<Path[]>([]);
  const [nodes, setNodes] = useState<DiagnosisNode[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch('/api/learning-paths');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '学习路径读取失败');
    setItems(data.items); setNodes(data.nodes);
    setSelected(value => data.items.some((item: Path) => item.id === value) ? value : data.items[0]?.id || '');
  }, []);
  useEffect(() => { load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }, [load]);
  const path = items.find(item => item.id === selected);
  const step = path?.state.steps[path.state.current];
  const node = nodes.find(item => item.id === step?.nodeId);
  const firstNode = path && nodes.find(item => item.id === path.state.steps[0]?.nodeId);
  const progress = path ? Math.round(path.state.current / Math.max(path.state.steps.length, 1) * 100) : 0;
  const complete = async () => {
    if (!path) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/learning-paths', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: path.id, index: path.state.current }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '进度保存失败');
      await load(); setMessage('已保存学习进度，继续下一步。');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const practiceUrl = node && `/ai-practice?subject=${encodeURIComponent(node.subject)}&knowledgePoint=${encodeURIComponent(node.term)}&grade=${encodeURIComponent(node.grade)}&count=${step?.kind === 'practice' ? 3 : 1}&new=1`;
  const retestUrl = node && `/knowledge-library/diagnosis?subject=${encodeURIComponent(node.subject)}&topic=${encodeURIComponent(node.id)}`;

  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 md:px-8">
    <KnowledgeNavigation />
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-slate-900">学习路径</h1><p className="mt-1 text-sm text-slate-600">从诊断结果出发，按知识点依次补基础、做例题、练习和再测；进度自动保存。</p></div><Link href="/knowledge-library/diagnosis" className="rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-700">查看知识诊断</Link></header>
    {message && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}
    {loading ? <p role="status" className="rounded-xl border bg-white p-6 text-sm text-slate-500">正在读取学习路径…</p> : items.length === 0 ? <div className="rounded-xl border bg-white p-6 text-sm">还没有学习路径。请先完成<Link className="text-indigo-600 underline" href="/knowledge-library/diagnosis">知识诊断</Link>，再从诊断结果创建。</div> : <div className="grid gap-5 md:grid-cols-[240px_1fr]">
      <aside className="space-y-2" aria-label="选择学习路径">{items.map(item => {
        const target = nodes.find(node => node.id === item.state.steps[0]?.nodeId);
        return <button key={item.id} onClick={() => { setSelected(item.id); setMessage(''); }} aria-current={selected === item.id ? 'step' : undefined} className={`w-full rounded-xl border p-3 text-left text-sm ${selected === item.id ? 'border-indigo-400 bg-indigo-50' : 'bg-white hover:border-indigo-200'}`}><b>{target ? `${target.subject} · ${target.term}` : '知识点已变更'}</b><p className="mt-1 text-slate-600">{item.state.current === item.state.steps.length ? '已完成' : `${item.state.current}/${item.state.steps.length} 步`} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}</p></button>;
      })}</aside>
      {path && <section className="rounded-xl border bg-white p-5"><h2 className="text-lg font-semibold text-slate-900">{node?.term || firstNode?.term || '学习路径已完成'}</h2><p className="mt-1 text-sm text-slate-500">{firstNode?.subject || '知识点'} · 已完成 {path.state.current}/{path.state.steps.length} 步</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={path.state.current} aria-valuemin={0} aria-valuemax={path.state.steps.length} aria-label="学习路径进度"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${progress}%` }} /></div>
        <ol className="mt-5 space-y-2">{path.state.steps.map((item, index) => <li key={`${item.nodeId}-${item.kind}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${index === path.state.current ? 'border-indigo-300 bg-indigo-50' : ''}`}><span>{index + 1}. {nodes.find(entry => entry.id === item.nodeId)?.term || '已移除知识点'} · {labels[item.kind]}</span><span className={item.completedAt ? 'text-emerald-700' : 'text-slate-500'}>{item.completedAt ? '已完成' : index === path.state.current ? '进行中' : '未开始'}</span></li>)}</ol>
        {step && node && <div className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm"><h3 className="font-semibold">当前步骤：{labels[step.kind]} · {node.term}</h3>{step.kind === 'foundation' && <><p>知识点说明：{node.meaning || '暂无内容，请结合教材或诊断中的知识点依据学习。'}</p><p className="text-slate-500">{node.publisher} · {node.textbook} · {node.grade}{node.volume} · {node.chapter}{node.lessonPages.length ? ` · 第 ${node.lessonPages.join('、')} 页` : ''}</p><Link className="text-indigo-700 underline" href={retestUrl!}>查看教材依据与先修关系</Link></>}
          {(step.kind === 'example' || step.kind === 'practice') && <><p>{step.kind === 'example' ? '先独立完成 1 道示范题，再对照答案、完成自评。' : '围绕当前知识点完成 3 道题，逐题提交并完成自评。'}</p><Link href={practiceUrl!} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white">打开新练习</Link><p className="text-xs text-slate-500">在新页面完成后返回此处，点击“检查结果并继续”；未达到要求不会误标记完成。</p></>}
          {step.kind === 'retest' && <><p>重新诊断此知识点，检查补学后的掌握情况。</p><Link href={retestUrl!} target="_blank" rel="noreferrer" className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-white">打开再测</Link></>}
          <div><button disabled={busy} onClick={complete} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-indigo-700 disabled:opacity-40">{busy ? '正在检查…' : step.kind === 'foundation' ? '已学习，保存进度' : '检查结果并继续'}</button></div></div>}
        {step && !node && <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">当前知识点已从教材目录中移除，无法继续此路径。请重新完成诊断并建立新路径。</p>}
        {!step && <p className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">本条路径已完成！可以回到知识诊断检查掌握情况。</p>}
      </section>}
    </div>}
  </main>;
}
