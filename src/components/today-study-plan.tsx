"use client";

import {useCallback, useEffect, useState} from 'react';
import Link from 'next/link';
import {apiClient, friendlyApiError} from '@/lib/api-client';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {MarkdownRenderer} from './markdown-renderer';

type Task = {
  id: string;
  subject: string;
  questionText: string;
  answerText: string | null;
  analysis: string | null;
  reason: string;
  curriculum: string;
  knowledgePoints: string[];
};
type Result = {correct: number; total: number};
type Plan = {
  dailyMinutes: number;
  completedToday: number;
  tasks: Task[];
  dueCount: number;
  pendingCorrectionCount: number;
  pendingCorrections: Task[];
  todaySuggestion: string;
  recommendedCount: number;
  knowledgePoints: {name: string; errors: number; mastered: number; reviewWrong: number}[];
  causes: {name: string; count: number}[];
  objective: Result;
  self: Result;
  unknown: number;
  review: Result;
  trend: {date: string; total: number; correct: number}[];
};

function ReviewTask({task, onDone, expanded = false}: {task: Task; onDone: () => void; expanded?: boolean}) {
  const [answer, setAnswer] = useState('');
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(result: string) {
    setBusy(true);
    try {
      await apiClient.post('/api/study-plan/review', {id: task.id, answer, result});
      onDone();
    } catch (error) {
      setMessage(friendlyApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details open={expanded || undefined} className="rounded-xl border p-3">
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{task.subject} · {task.questionText.slice(0, 60)}</span>
        <span className="mt-1 block text-xs text-indigo-500">{task.reason}</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-indigo-600">复习教材：{task.curriculum}</p>
        <Link
          href={'/ai-practice?new=1&count=1&subject=' + encodeURIComponent(task.subject === '未分类' ? '其他' : task.subject) + '&knowledgePoint=' + encodeURIComponent(task.knowledgePoints.join('、'))}
          className="inline-flex text-xs text-indigo-600"
        >按本学科教材生成复习变式</Link>
        <MarkdownRenderer content={task.questionText} />
        <Textarea
          aria-label="复习独立作答"
          placeholder="先独立作答，再查看解析并评价"
          value={answer}
          onChange={event => setAnswer(event.target.value)}
          maxLength={5000}
        />
        <Button size="sm" variant="outline" disabled={!answer.trim()} onClick={() => setShow(true)}>
          对照答案与解析
        </Button>
        {show && <>
          <MarkdownRenderer content={task.answerText || '尚无参考答案，请先核对原题'} />
          <MarkdownRenderer content={task.analysis || ''} />
          {task.answerText && <div className="flex flex-wrap gap-2">
            {([['mastered', '已掌握'], ['unclear', '仍不理解'], ['careless', '粗心出错']] as const).map(([result, label]) =>
              <Button key={result} size="sm" variant="outline" disabled={busy} onClick={() => save(result)}>
                {label}
              </Button>
            )}
          </div>}
          <Link href={'/error-items/' + task.id} className="block text-xs text-indigo-500">
            打开完整错题
          </Link>
        </>}
        {message && <p role="alert" className="text-xs text-red-500">{message}</p>}
      </div>
    </details>
  );
}

function ActionStep({number, title, count, children}: {
  number: number;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return <section className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
    <h3 className="font-medium">{number}. {title}{count !== undefined && ` · ${count} 道`}</h3>
    {children}
  </section>;
}

const rate = (result: Result) => result.total
  ? `${Math.round(result.correct / result.total * 100)}%（${result.correct}/${result.total}）`
  : '暂无记录';

function LearningAnalysis({plan}: {plan: Plan}) {
  return <details>
    <summary className="cursor-pointer text-sm font-medium">知识点与学习效果分析</summary>
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      {([['客观题首次作答', rate(plan.objective)], ['开放题自评', rate(plan.self)], ['错题复习自评', rate(plan.review)]]).map(([title, value]) =>
        <div key={title} className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-400">{title}</p>
          <p className="mt-1 text-sm font-medium">{value}</p>
        </div>
      )}
    </div>
    {plan.unknown > 0 && <p className="mt-2 text-xs text-slate-400">另有 {plan.unknown} 条旧记录无法区分判定方式。</p>}
    <h3 className="mt-4 text-sm font-medium">知识点掌握与重复错误</h3>
    {plan.knowledgePoints.map(point =>
      <div key={point.name} className="mt-2 flex flex-wrap justify-between gap-2 text-xs">
        <span>{point.name}</span>
        <span>错题 {point.errors} · 已掌握 {point.mastered} · 复习答错 {point.reviewWrong} 次</span>
        <div className="h-1.5 w-full rounded bg-slate-100">
          <div className="h-full rounded bg-indigo-400" style={{width: `${point.errors ? point.mastered / point.errors * 100 : 0}%`}} />
        </div>
      </div>
    )}
    <h3 className="mt-4 text-sm font-medium">错因分布</h3>
    <p className="mt-2 text-xs text-slate-500">
      {plan.causes.map(cause => `${cause.name} ${cause.count} 题`).join(' · ') || '尚无错因标记'}
    </p>
    <h3 className="mt-4 text-sm font-medium">最近 14 个有作答记录的日期</h3>
    <div className="mt-2 flex flex-wrap gap-2">
      {plan.trend.map(point =>
        <span key={point.date} className="rounded-lg bg-slate-50 p-2 text-xs">
          {point.date} · 正确 {point.correct}/{point.total}
        </span>
      )}
    </div>
  </details>;
}

export function TodayStudyPlan() {
  const [plan, setPlan] = useState<Plan>();
  const [error, setError] = useState('');
  const [quickReview, setQuickReview] = useState(false);
  const load = useCallback(() => apiClient.get<Plan>('/api/study-plan')
    .then(data => { setPlan(data); setError(''); })
    .catch(cause => setError(friendlyApiError(cause))), []);
  useEffect(() => { void load(); }, [load]);

  return <section className="my-6 space-y-4 rounded-2xl border bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">今日三步行动</h2>
      <button className="text-xs text-indigo-500" onClick={() => window.dispatchEvent(new CustomEvent('open-app-settings', {detail: {tab: 'study'}}))}>
        设置教材
      </button>
    </div>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {plan ? <>
      <p className="text-sm text-slate-500">
        目标 {plan.dailyMinutes} 分钟 · 今日已复习 {plan.completedToday} 道 · 推荐复习 {plan.tasks.length} 道，再练 {plan.recommendedCount} 道新题
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-indigo-600">今日建议：{plan.todaySuggestion}</p><button type="button" aria-pressed={quickReview} onClick={() => setQuickReview(value => !value)} className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50">{quickReview ? '退出快速复习' : '开始快速复习'}</button></div>
      {quickReview && <p className="text-xs text-slate-500">先独立回忆并填写答案，再查看解析、自评；完成后列表自动更新。没有到期错题时，可从下方薄弱点开始练习。</p>}
      <ActionStep number={1} title="到期复习" count={plan.dueCount}>
        {plan.tasks.map((task, index) => <ReviewTask key={task.id} task={task} onDone={load} expanded={quickReview && index === 0} />)}
        {!plan.dueCount && <p className="text-sm text-slate-400">当前没有到期复习错题。</p>}
      </ActionStep>
      <ActionStep number={2} title="无计划旧题待订正" count={plan.pendingCorrectionCount}>
        {plan.pendingCorrections.map((task, index) => <ReviewTask key={task.id} task={task} onDone={load} expanded={quickReview && !plan.tasks.length && index === 0} />)}
        {!plan.pendingCorrectionCount && <p className="text-sm text-slate-400">当前没有待订正旧题。</p>}
      </ActionStep>
      <ActionStep number={3} title="针对薄弱点练习">
        <p className="text-sm text-slate-500">
          {plan.knowledgePoints.length ? `优先巩固：${plan.knowledgePoints.slice(0, 3).map(point => point.name).join('、')}` : '按当前教材和年级开始练习。'}
        </p>
        <Link href={'/ai-practice?count=' + plan.recommendedCount} className="inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white">
          开始今日 AI练习
        </Link>
      </ActionStep>
      <p className="text-xs text-slate-400">复习结果由你对照答案自评；在至少三个不同日期正确复习后，标记为已掌握。</p>
      <LearningAnalysis plan={plan} />
    </> : <p className="text-xs text-slate-400">正在整理学习计划…</p>}
  </section>;
}
