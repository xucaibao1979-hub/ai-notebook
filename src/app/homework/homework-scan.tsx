"use client";
import {useState} from 'react';
import {HomeworkQuestion} from '@/lib/homework';
import {MarkdownRenderer} from '@/components/markdown-renderer';
import {Button} from '@/components/ui/button';
import {apiClient,friendlyApiError} from '@/lib/api-client';

const labels:Record<HomeworkQuestion['judgement'],string>={correct:'正确',wrong:'错误',unanswered:'未作答',unclear:'待确认'};
type Props={questions:HomeworkQuestion[];autoAdded:Record<number,string>;reviewId:string};

export function HomeworkScan({questions,autoAdded,reviewId}:Props){
  const [active,setActive]=useState(0);
  const [manualAdded,setManualAdded]=useState<Record<number,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const question=questions[active];
  if(!question)return null;
  const addedId=manualAdded[active]||autoAdded[active];
  function select(index:number){setActive(index);setError('');}
  async function add(){
    setBusy(true);setError('');
    try{const result=await apiClient.post<{id:string}>('/api/homework/manual',{question,reviewId,index:active});setManualAdded(old=>({...old,[active]:result.id}));}
    catch(e){setError(friendlyApiError(e));}
    finally{setBusy(false);}
  }
  return <section className="space-y-5 rounded-2xl border bg-white p-5 md:p-7">
    <div><h2 className="text-xl font-semibold">识别结果 · {questions.length} 题</h2><p className="mt-1 text-sm text-slate-500">逐题查看答案和解析；明确错误的题会自动加入错题库。待确认题也可手动收录，答案仍标记为待核对。</p></div>
    <nav aria-label="识别题目切换" className="flex flex-wrap gap-2">{questions.map((q,index)=><button key={`${q.number}-${index}`} type="button" onClick={()=>select(index)} aria-current={index===active?'true':undefined} title={`${q.number} · ${labels[q.judgement]}`} className={`min-w-11 rounded-full px-3 py-2 text-sm font-medium ${index===active?'bg-orange-200 text-slate-900':q.judgement==='wrong'?'bg-red-50 text-red-700':q.judgement==='unclear'?'bg-amber-50 text-amber-700':'bg-slate-100 text-slate-600'}`}>{index+1}</button>)}</nav>
    <article className="space-y-5">
      <header><p className="text-sm text-slate-500">第 {active+1}/{questions.length} 题 · {question.number} · {question.subject}</p><span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs ${question.judgement==='wrong'?'bg-red-50 text-red-700':question.judgement==='unclear'?'bg-amber-50 text-amber-700':'bg-emerald-50 text-emerald-700'}`}>{labels[question.judgement]}</span></header>
      <div className="rounded-xl bg-slate-50 p-4"><h3 className="mb-2 text-sm font-semibold">题目</h3><MarkdownRenderer content={question.questionText}/><p className="mt-3 text-sm text-slate-600">学生作答：{question.studentAnswer||'未识别到'}</p></div>
      <div className="border-t pt-5"><h3 className="mb-3 text-xl font-semibold text-emerald-600">✦ 答案</h3><MarkdownRenderer content={question.answerText}/></div>
      <div className="border-t pt-5"><h3 className="mb-3 text-xl font-semibold">解析</h3><MarkdownRenderer content={question.analysis}/></div>
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><div className="flex gap-2"><Button variant="outline" disabled={active===0} onClick={()=>select(active-1)}>上一题</Button><Button variant="outline" disabled={active===questions.length-1} onClick={()=>select(active+1)}>下一题</Button></div><Button disabled={busy||!!addedId} onClick={add}>{addedId?'已加入错题库':busy?'正在添加…':'添加至错题库'}</Button></div>
    </article>
  </section>;
}
