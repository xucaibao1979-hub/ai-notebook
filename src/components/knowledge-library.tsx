"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Library, BookOpen, Search, Eye, EyeOff, ArrowLeft, ArrowRight, ExternalLink, Download, Loader2, RefreshCw, FileText, ChevronDown, NotebookTabs, History } from 'lucide-react';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { EXAM_SUBJECTS, GRADE_LABELS, RECENT_EXAM_YEARS, LibraryPaper } from '@/lib/knowledge-library';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { questionQuality, questionQualityState } from '@/lib/paper-quality';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { Textarea } from '@/components/ui/textarea';
import { LibraryHtml } from '@/components/library-html';
import { PaperPracticeTools } from '@/components/paper-practice-tools';
import { PaperErrorTransfer } from '@/components/paper-error-transfer';
import { KnowledgeNavigation } from '@/components/knowledge-navigation';

type Catalog = { sources?:{name:string;count:number}[]; papers: LibraryPaper[]; total: number; page: number; pageSize: number; regions: string[]; subjects: { subject: string; count: number }[]; years: { year: number; examType: string; count: number }[]; summary: { papers: number; questions: number; answers: number; errors: number; historyExercises: number }; coverage: string };
type Attempt = { id: string; paperId: string; answers: Record<string,string>; completed: boolean; durationSeconds:number; updatedAt: string; paper?: {title:string;subject:string;year:number} };
type SyncStatus = { state: string; discovered: number; processed: number; imported: number; failed: number; errors?: { url: string; message: string }[] };
const selectClass = 'h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100';

function Filter({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
    return <label className="space-y-1.5"><span className="block text-xs text-slate-500">{label}</span><span className="relative block"><select aria-label={label} className={selectClass} {...props}>{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-slate-400" /></span></label>;
}
const errorMessage = friendlyApiError;

export function KnowledgeLibrary() {
    const { data: session } = useSession();
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [subject, setSubject] = useState('数学');
    const [year, setYear] = useState('');
    const [source,setSource]=useState('');
    const [format,setFormat]=useState('');
    useEffect(()=>{const query=new URLSearchParams(window.location.search);if(query.get('paper'))setPaperId(query.get('paper')!);if(query.get('year'))setYear(query.get('year')!);if(query.get('subject'))setSubject(query.get('subject')!);if(query.get('format'))setFormat(query.get('format')!);},[]);
    const [exam, setExam] = useState('');
    const [examGrade, setExamGrade] = useState('');
    const [knowledgeGrade, setKnowledgeGrade] = useState('');
    const [region, setRegion] = useState('');
    const [search, setSearch] = useState('');
    const [showFilters,setShowFilters]=useState(false);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [paperId, setPaperId] = useState('');
    const [paper, setPaper] = useState<LibraryPaper | null>(null);
    const [showAnswers, setShowAnswers] = useState(false);
    const [detailGrade, setDetailGrade] = useState('all');
    const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set());
    const [expandedRisk, setExpandedRisk] = useState<Set<string>>(new Set());
    const [detailLoading, setDetailLoading] = useState(false);
    const [syncStarting, setSyncStarting] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState('');
    const [correction, setCorrection] = useState('');
    const [answerCorrection,setAnswerCorrection]=useState('');
    const [gradeCorrection,setGradeCorrection]=useState('');
    const [savingCorrection, setSavingCorrection] = useState(false);
    const [history, setHistory] = useState<Attempt[]>([]);
    const [historyVisible, setHistoryVisible] = useState(false);
    const [attemptId, setAttemptId] = useState('');
    const [answers, setAnswers] = useState<Record<string,string>>({});
    const [savingAttempt, setSavingAttempt] = useState(false);
    const [attemptMessage, setAttemptMessage] = useState('');
    const [durationSeconds,setDurationSeconds]=useState(0);
    const [attemptCompleted,setAttemptCompleted]=useState(false);
    useEffect(()=>{if(!paperId||attemptCompleted)return;let lastTick=Date.now();const timer=setInterval(()=>{const elapsed=Math.floor((Date.now()-lastTick)/1000);lastTick+=elapsed*1000;setDurationSeconds(v=>Math.min(604800,v+elapsed));},1000);return()=>clearInterval(timer);},[paperId,attemptCompleted]);
    useEffect(() => { apiClient.get<Attempt[]>('/api/knowledge-library/history').then(setHistory).catch(() => {}); }, []);
    const answerEpoch = useRef(0);
    const catalogEpoch = useRef(0);

    const fetchCatalog = useCallback(async () => {
        const epoch = ++catalogEpoch.current;
        setLoading(true); setError('');
        try {
            const data = await apiClient.get<Catalog>('/api/knowledge-library', { params: { subject,source,format, year: /^\d{4}$/.test(year) ? year : '', exam, examGrade, knowledgeGrade, region, search: query, page: String(page) } });
            if (epoch === catalogEpoch.current) setCatalog(data);
            try {
                const status = await apiClient.get<SyncStatus>('/api/knowledge-library/sync');
                if (epoch === catalogEpoch.current) setSyncStatus(status);
            } catch { /* Catalog retrieval does not depend on the sync monitor. */ }
        } catch (error) { if (epoch === catalogEpoch.current) setError(errorMessage(error)); }
        finally { if (epoch === catalogEpoch.current) setLoading(false); }
    }, [subject,source,format, year, exam, examGrade, knowledgeGrade, region, query, page]);
    useEffect(() => { fetchCatalog(); }, [fetchCatalog]);
    useEffect(() => {
        let active = true;
        async function loadProgress() {
            try { const status = await apiClient.get<SyncStatus>('/api/knowledge-library/sync'); if (active) setSyncStatus(status); }
            catch { /* Catalog remains usable if no sync tool is deployed. */ }
        }
        loadProgress();
        const timer = setInterval(loadProgress, 10000);
        return () => { active = false; clearInterval(timer); };
    }, []);
    useEffect(() => {
        if (!paperId) return;
        let active = true;
        setDetailLoading(true);
        apiClient.get<LibraryPaper>(`/api/knowledge-library/${paperId}`, { params: { answers: showAnswers ? '1' : '0', grade: detailGrade } })
            .then(paper => { if (active) setPaper(paper); }).catch(error => { if (active) setError(errorMessage(error)); })
            .finally(() => { if (active) setDetailLoading(false); });
        return () => { active = false; };
    }, [paperId, showAnswers, detailGrade]);

    async function loadHistory() { try { setHistory(await apiClient.get<Attempt[]>('/api/knowledge-library/history')); setHistoryVisible(true); } catch (e) { setError(errorMessage(e)); } }
    async function saveAttempt(completed: boolean) {
        setSavingAttempt(true); setError(''); setAttemptMessage('');
        try { const saved = await apiClient.post<{id:string}>('/api/knowledge-library/history', {paperId, ...(attemptId ? {id:attemptId} : {}), answers, completed,durationSeconds});setAttemptCompleted(completed); setAttemptId(saved.id); setAttemptMessage(completed ? '已完成，作答已保存到历史记录' : '作答已保存，可从历史记录继续'); setHistory(await apiClient.get<Attempt[]>('/api/knowledge-library/history')); } catch (e) {setError(errorMessage(e));} finally {setSavingAttempt(false);}
    }
    function openPaper(paper: LibraryPaper) { setDurationSeconds(0);setAttemptCompleted(false);setAttemptId(''); setAnswers({}); setAttemptMessage(''); answerEpoch.current++; setPaper(null); setPaperId(paper.id); setShowAnswers(false); setDetailGrade(knowledgeGrade || 'all'); setRevealedQuestions(new Set()); setExpandedRisk(new Set()); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    function hideAll() { answerEpoch.current++; setShowAnswers(false); setRevealedQuestions(new Set()); setExpandedRisk(new Set()); setPaper(previous => previous ? { ...previous, questions: previous.questions?.map(question => ({ ...question, answerHtml: '',correctedAnswerMarkdown:undefined })), attachments: previous.attachments?.filter(item => item.kind !== 'answer') } : null); }
    async function revealOne(number: string) {
        const epoch = answerEpoch.current;
        try {
            const data = await apiClient.get<LibraryPaper>(`/api/knowledge-library/${paperId}`, { params: { answers: '1', grade: detailGrade } });
            if (epoch !== answerEpoch.current) return;
            const target = data.questions?.find(question => question.number === number);
            setPaper(previous => previous && target ? { ...previous, questions: previous.questions?.map(question => question.number === number ? target : question) } : previous);
            setRevealedQuestions(previous => new Set([...previous, number]));
        } catch (error) { setError(errorMessage(error)); }
    }
    async function startSync() {
        setSyncStarting(true); setError('');
        try { await apiClient.post('/api/knowledge-library/sync', {}); setSyncStatus(previous => ({ state: 'running', discovered: previous?.discovered || 0, processed: 0, imported: 0, failed: 0 })); }
        catch (error) { setError(errorMessage(error)); }
        finally { setSyncStarting(false); }
    }
    async function saveCorrection() {
        setSavingCorrection(true); setError('');
        try {
            await apiClient.post(`/api/knowledge-library/${paperId}/review`, { number: editingQuestion, markdown: correction,...(answerCorrection.trim()?{answerMarkdown:answerCorrection}:{}),grade:gradeCorrection?Number(gradeCorrection):null });
            const refreshed = await apiClient.get<LibraryPaper>(`/api/knowledge-library/${paperId}`, { params: { answers: showAnswers ? '1' : '0', grade: detailGrade } });
            setPaper(refreshed); setEditingQuestion('');
        } catch (error) { setError(errorMessage(error)); }
        finally { setSavingCorrection(false); }
    }
    async function retryContent() {
        if (!paperId) return fetchCatalog();
        setError(''); setDetailLoading(true);
        try { setPaper(await apiClient.get<LibraryPaper>(`/api/knowledge-library/${paperId}`, { params: { answers: showAnswers ? '1' : '0', grade: detailGrade } })); }
        catch (error) { setError(errorMessage(error)); }
        finally { setDetailLoading(false); }
    }
    function filterChange(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
    if (paperId) return <main className="mx-auto max-w-6xl space-y-5 p-5 pb-16 md:p-8">
        <Button variant="ghost" onClick={() => { setPaperId(''); setPaper(null); setError(''); }} className="px-0 text-slate-500"><ArrowLeft className="mr-2 size-4" />返回知识库</Button>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={retryContent}>重新加载</button></p>}
        {!paper && detailLoading ? <p className="p-10 text-center text-slate-400">正在加载试卷…</p> : paper && <>
            <header><p className="mb-2 text-sm text-indigo-500">{paper.examType === 'zhongkao' ? '中考' : '高考'} · {paper.subject} · {paper.region}</p><h1 className="text-2xl font-semibold text-slate-800">{paper.title}</h1><p className="mt-2 text-sm text-slate-500">共 {paper.status==='image_original'?`完整原卷 · ${paper.imagePageCount||0} 页`:paper.questionCount ? paper.questionCount + ' 道题' : '原卷阅读'} · {paper.status==='image_original'?`${paper.answerPageCount||0} 页答案与解析`:`${paper.answerCount} 道有独立答案`} · 来源标称 {paper.year} 年</p></header>
            {paper.alternatives?.length ? <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"><h2 className="text-sm font-medium">同一试卷 · 多来源对照</h2><div className="mt-2 flex flex-wrap gap-3">{paper.alternatives.map(a=><a key={a.id} href={'/knowledge-library?paper='+a.id} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 underline">{a.sourceName}{a.status==='image_original'?' · 完整原卷图片':''}</a>)}</div></section>:null}
            <a className="inline-flex text-xs text-indigo-600 underline" href={'/knowledge-library?year='+paper.year+'&subject='+encodeURIComponent(paper.subject)+'&format=images'} target="_blank" rel="noreferrer">查找同年同科目的完整原卷来源</a>
            <details className="rounded-xl border bg-white p-4 text-xs leading-6 text-slate-500"><summary className="cursor-pointer">来源与资料完整性说明 · {paper.quality?.issues || 0} 题需核对</summary><p>保留公开来源内容。已本地校对 {paper.quality?.locallyReviewed || 0} 道题；来源身份、教材年级与缺失资料请结合原卷核对。</p>{paper.qualityNote}</details>
            <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur md:top-0">
                <div className="flex flex-wrap gap-2"><Button disabled={detailLoading} onClick={() => { if (showAnswers || revealedQuestions.size || expandedRisk.size) hideAll(); else setShowAnswers(true); }} className="bg-indigo-500 hover:bg-indigo-600">{showAnswers || revealedQuestions.size || expandedRisk.size ? <EyeOff className="mr-2 size-4" /> : <Eye className="mr-2 size-4" />}{showAnswers || revealedQuestions.size || expandedRisk.size ? '一键隐藏全部答案' : '显示全部答案'}</Button><a href={paper.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs text-indigo-500 hover:bg-indigo-50"><ExternalLink className="size-3.5" />查看来源</a></div>
                <div className="flex gap-2"><Button variant="outline" disabled={savingAttempt} onClick={() => saveAttempt(false)}>保存作答</Button><Button disabled={savingAttempt} onClick={() => saveAttempt(true)}>完成并记录</Button><Button variant="outline" onClick={() => {setAttemptId('');setAnswers({});setDurationSeconds(0);setAttemptCompleted(false);}}>重新作答</Button></div><div className="w-44"><Filter label="题目知识年级" value={detailGrade} onChange={e => { answerEpoch.current++; setDetailGrade(e.target.value); setRevealedQuestions(new Set()); setExpandedRisk(new Set()); }}><option value="all">全部年级</option>{Object.entries(GRADE_LABELS).map(([grade, label]) => <option value={grade} key={grade}>{label}</option>)}<option value="unknown">未标注 / 待确认</option></Filter></div>
            </div>
            <PaperPracticeTools numbers={(paper.questions||[]).map(q=>q.number)} answers={answers} seconds={durationSeconds} completed={attemptCompleted} onJump={number=>document.getElementById('paper-question-'+encodeURIComponent(number))?.scrollIntoView({behavior:'smooth',block:'center'})} />
            {attemptMessage && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{attemptMessage}</p>}
            {detailLoading && <p role="status" className="text-center text-xs text-slate-400">正在更新答案显示与筛选…</p>}
            {!detailLoading && !paper.questions?.length && <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-400">这份试卷没有匹配该知识年级的题目；可以查看“未标注 / 待确认”或全部题目。</p>}
            {paper.questions?.map(question => {
                const visible = showAnswers || revealedQuestions.has(question.number);
                const riskyHidden = question.answerLeakRisk && !showAnswers && !expandedRisk.has(question.number);
                return <article id={'paper-question-'+encodeURIComponent(question.number)} key={question.number} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-500">{question.wholePaper ? '整卷原文' : '第 ' + question.number + ' 题'}</span><span className="text-xs text-slate-400" title={question.gradeBasis}>{question.grade ? `${GRADE_LABELS[question.grade]||question.grade+' 年级'} · ${question.gradeVerified?'已校对年级':'推断标签'}` : '知识年级待确认'}</span></div>
                    <p className="mb-2 text-xs text-slate-400">资料状态：{questionQualityState(question)}</p>
                    {!!questionQuality(question).length && <details className="mb-3 rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-500"><summary className="cursor-pointer">查看本题资料说明</summary>{questionQuality(question).map(issue => <p key={issue}>{issue}</p>)}</details>}
                    {riskyHidden ? <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-700"><p>来源题干可能混有答案，隐藏答案时默认折叠。</p><button className="mt-2 text-xs underline" onClick={() => setExpandedRisk(previous => new Set([...previous, question.number]))}>仍查看来源题干</button></div> : question.correctedMarkdown ? <MarkdownRenderer content={question.correctedMarkdown} /> : <LibraryHtml html={question.questionHtml}/>}
                    {question.locallyReviewed && <p className="mt-3 text-xs text-emerald-700">本地校对版 · 保留原始出处，不代表官方认证</p>}
                    {session?.user.role === 'admin' && <div className="mt-3">
                        {editingQuestion === question.number ? <div className="space-y-3 rounded-xl border border-indigo-100 p-4"><p className="text-xs leading-6 text-slate-500">对照原卷修改题干，移除答案提示，补齐条件。支持 Markdown、公式和题图链接。原始内容会保留。</p><Textarea aria-label="校对题干" value={correction} onChange={e => setCorrection(e.target.value)} className="min-h-40" maxLength={100000} /><Textarea aria-label="校对答案与解析" value={answerCorrection} onChange={e=>setAnswerCorrection(e.target.value)} placeholder="可补充按原卷核对的答案与解析（Markdown），留空保留已有答案" maxLength={100000}/><Filter label="人工校对知识年级" value={gradeCorrection} onChange={e=>setGradeCorrection(e.target.value)}><option value="">待确认</option>{Object.entries(GRADE_LABELS).map(([grade,label])=><option key={grade} value={grade}>{label}</option>)}</Filter><div className="flex gap-2"><Button disabled={savingCorrection || !correction.trim()} onClick={saveCorrection}>保存本地校对</Button><Button variant="ghost" disabled={savingCorrection} onClick={() => setEditingQuestion('')}>取消</Button></div></div> : <button className="text-xs text-indigo-500 underline" onClick={() => { setEditingQuestion(question.number);setAnswerCorrection(question.correctedAnswerMarkdown||'');setGradeCorrection(question.grade?String(question.grade):''); setCorrection(question.correctedMarkdown || question.questionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }}>校对本题题干</button>}
                    </div>}
                    <label className="mt-5 block text-xs text-slate-500">我的作答<Textarea className="mt-2" value={answers[question.number] || ''} onChange={e => setAnswers(previous => ({...previous,[question.number]:e.target.value}))} placeholder="填写答案或解题过程，点击保存作答保留记录" maxLength={10000} /></label>
                    {visible && (question.answerHtml||question.correctedAnswerMarkdown) ? <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"><h3 className="mb-3 text-sm font-semibold text-emerald-700">来源答案与解析</h3>{question.correctedAnswerMarkdown?<MarkdownRenderer content={question.correctedAnswerMarkdown}/>:<LibraryHtml html={question.answerHtml}/>}</div> : !visible && <Button variant="ghost" size="sm" className="mt-4 text-indigo-500" onClick={() => revealOne(question.number)}><Eye className="mr-2 size-4" />查看本题答案</Button>}
                    {!question.wholePaper && <PaperErrorTransfer paperId={paperId} number={question.number} answer={answers[question.number]||''} />}
                    {visible && !question.answerHtml && !question.correctedAnswerMarkdown && <p className="mt-4 text-xs text-slate-400">来源尚未提供可独立提取的答案，请核对原卷。</p>}
                </article>;
            })}
            {!!paper.attachments?.length && <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 text-sm font-semibold text-slate-700">来源附件</h2><div className="flex flex-wrap gap-3">{paper.attachments.map(item => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:underline"><Download className="size-3.5" />{item.label}</a>)}</div></section>}
        </>}
    </main>;
    return <main className="mx-auto max-w-6xl space-y-6 p-5 pb-16 md:p-8">
        <KnowledgeNavigation />
        <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-medium tracking-wider text-indigo-500">EXAM LIBRARY</p><h1 className="text-3xl font-semibold text-slate-800">知识库</h1><p className="mt-2 text-sm text-slate-500">中高考公开试卷，支持按科目、年份查询，按年级练习。</p></div><div className="flex gap-2"><Button variant="outline" onClick={loadHistory}>作答历史</Button><Button variant="outline" disabled={loading} onClick={fetchCatalog}><RefreshCw className="mr-2 size-4" />刷新目录</Button>{session?.user.role === 'admin' && <Button disabled={syncStarting || syncStatus?.state === 'running'} onClick={startSync} className="bg-indigo-500 hover:bg-indigo-600">{syncStarting || syncStatus?.state === 'running' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}{syncStatus?.state === 'running' ? '正在同步' : '同步多平台试卷'}</Button>}</div></header>
        {historyVisible && <section className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><h2>作答历史 · 最近 100 次</h2><button onClick={() => setHistoryVisible(false)}>收起</button></div>{history.length ? history.map(record => <button key={record.id} className="mt-3 block w-full rounded-xl bg-slate-50 p-3 text-left text-sm" onClick={() => {openPaper({id:record.paperId} as LibraryPaper);setAttemptId(record.id);setAnswers(record.answers);setDurationSeconds(record.durationSeconds||0);setAttemptCompleted(record.completed);}}>{record.paper?.subject} · {record.paper?.title || '试卷'}<span className="ml-3 text-xs text-slate-500">{record.completed ? '已完成' : '进行中'} · 已填写 {Object.values(record.answers).filter(a=>a.trim()).length} 题 · {new Date(record.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</span></button>) : <p className="mt-3 text-sm text-slate-400">暂无作答记录，进入试卷填写并保存即可。</p>}</section>}
        <div className="overflow-x-auto"><section className="grid min-w-[760px] grid-cols-5 gap-3" aria-label="知识库统计">{[{ label: '已收录试卷', value: catalog?.summary.papers, icon: FileText }, { label: '已提取题目', value: catalog?.summary.questions, icon: BookOpen }, { label: '独立答案', value: catalog?.summary.answers, icon: Library }, { label: '错题本', value: catalog?.summary.errors, icon: NotebookTabs }, { label: '历史习题', value: catalog?.summary.historyExercises, icon: History }].map(item => <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5"><item.icon className="mb-3 size-5 text-indigo-400" /><p className="text-2xl font-semibold text-slate-800">{item.value?.toLocaleString() || '0'}</p><p className="mt-1 text-xs text-slate-400">{item.label}</p></div>)}</section></div>
        {syncStatus && syncStatus.state !== 'idle' && <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-6 text-slate-600"><p>抓取状态：{syncStatus.state === 'running' ? '进行中' : syncStatus.state === 'completed' ? '当前来源目录处理完成' : syncStatus.state === 'completed_with_errors' ? '目录已处理，有缺失待补充' : syncStatus.state === 'rate_limited' ? '来源限流，已停止' : '部分完成 / 待处理'} · 已处理 {syncStatus.processed} / {syncStatus.discovered} 页 · 本次导入 {syncStatus.imported} 份 · 失败 {syncStatus.failed} 页</p><p className="text-slate-400">公开来源覆盖有限，“目录处理完成”不等于全国所有试卷齐全。可刷新目录查看新导入的内容。</p>{!!syncStatus.errors?.length && <details className="mt-1"><summary className="cursor-pointer text-indigo-500">查看近期缺失与失败原因</summary>{syncStatus.errors.map((item, index) => <p key={index} className="break-all">{item.url}：{item.message}</p>)}</details>}</div>}
        <p className="text-xs leading-6 text-slate-500">逐题内容不完整时，可选择“完整原卷图片”保留全部题图与公式，并在试卷内切换其他来源核对。图片支持放大和原尺寸查看。</p>
        <section className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6">
            {showFilters&&<div className="mt-5 space-y-4">
            <div className="mb-5 flex flex-wrap gap-2"><button onClick={() => filterChange(setSubject, '')} className={`rounded-xl border px-4 py-2.5 text-sm ${!subject ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500'}`}>全部科目</button>{EXAM_SUBJECTS.map(name => <button key={name} onClick={() => filterChange(setSubject, name)} aria-pressed={subject === name} className={`rounded-xl border px-4 py-2.5 text-sm ${subject === name ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-500 hover:border-indigo-200'}`}>{name}<span className="ml-1 text-[11px] text-slate-400">{catalog?.subjects.find(item => item.subject === name)?.count || 0}</span></button>)}</div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5"><Filter label="资料来源" value={source} onChange={e=>filterChange(setSource,e.target.value)}><option value="">全部平台</option>{catalog?.sources?.map(s=><option key={s.name} value={s.name}>{s.name}（{s.count}）</option>)}</Filter><Filter label="资料形式" value={format} onChange={e=>filterChange(setFormat,e.target.value)}><option value="">全部资料</option><option value="questions">逐题练习</option><option value="images">完整原卷图片</option></Filter><label className="space-y-1.5"><span className="block text-xs text-slate-500">试卷年份</span><Input aria-label="试卷年份" type="number" min={1900} max={new Date().getFullYear()} placeholder="全部年份，例如 2014" value={year} onChange={e=>filterChange(setYear,e.target.value)} className="h-10 rounded-xl border-slate-200" /></label><Filter label="考试类型" value={exam} onChange={e => filterChange(setExam, e.target.value)}><option value="">中考 + 高考</option><option value="zhongkao">中考</option><option value="gaokao">高考</option></Filter><Filter label="地区 / 卷型" value={region} onChange={e => filterChange(setRegion, e.target.value)}><option value="">全部地区</option>{catalog?.regions.map(region => <option key={region}>{region}</option>)}</Filter><Filter label="考试年级" value={examGrade} onChange={e => filterChange(setExamGrade, e.target.value)}><option value="">全部考试年级</option><option value="7">七年级</option><option value="8">八年级 · 初二地生考试等</option><option value="9">九年级 · 中考</option><option value="10">高一</option><option value="11">高二</option><option value="12">高三 · 高考</option></Filter><Filter label="题目知识年级" value={knowledgeGrade} onChange={e => filterChange(setKnowledgeGrade, e.target.value)}><option value="">全部知识年级</option>{Object.entries(GRADE_LABELS).map(([grade, label]) => <option key={grade} value={grade}>{label}</option>)}<option value="unknown">未标注 / 待确认</option></Filter></div>
            </div>}
            <form className="order-first flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); }}><Input aria-label="搜索试卷" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索试卷标题、地区或卷型…" className="h-10 min-w-48 flex-1 rounded-xl border-slate-200" maxLength={100} /><Button variant="outline" type="submit"><Search className="size-4" /><span className="ml-1 hidden sm:inline">搜索</span></Button><Button variant="outline" type="button" aria-expanded={showFilters} onClick={()=>setShowFilters(value=>!value)}>筛选<ChevronDown className="ml-2 size-4" /></Button></form>{showFilters&&<p className="mt-3 text-xs leading-6 text-slate-400">考试年级用于筛选整卷；知识年级用于筛选题目考点。目前仅对可识别的数学知识点推断年级，其他题目保留“待确认”，不会把考试年级当成知识年级。</p>}
        </section>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}<button className="ml-3 underline" onClick={retryContent}>重新加载</button></p>}
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-800">{subject || '全部学科'}试卷 · 年份从新到旧 <span className="text-sm font-normal text-slate-400">{catalog?.total || 0} 份</span></h2><span className="text-xs text-slate-400">默认隐藏答案 · 保留原始出处</span></div>
        {loading ? <p className="p-10 text-center text-sm text-slate-400">正在加载试卷目录…</p> : catalog?.papers.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.papers.map(paper => <button key={paper.id} onClick={() => openPaper(paper)} className="group rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md"><div className="mb-4 flex items-center justify-between"><span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs text-indigo-500">{paper.year} · {paper.examType === 'zhongkao' ? '中考' : '高考'}</span><FileText className="size-5 text-slate-300 group-hover:text-indigo-400" /></div><p className="mb-2 text-xs text-indigo-500">来源：{paper.sourceName}</p><h3 className="min-h-12 text-sm font-semibold leading-6 text-slate-700">{paper.title}</h3><p className="mt-3 text-xs text-slate-400">{paper.region} · {paper.subject} · {paper.questionCount ? paper.questionCount + ' 道题' : '原卷阅读'}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[11px] text-amber-600">{paper.status==='image_original'?`完整原卷图片 · ${paper.imagePageCount||0} 页 · 答案 ${paper.answerPageCount||0} 页`:history.some(r=>r.paperId===paper.id) ? `已练习 ${history.filter(r=>r.paperId===paper.id).length} 次 · 可继续作答` : paper.status === 'whole_paper' ? '原卷阅读 · 支持保存作答' : '逐题练习 · 答案默认隐藏'}</span><ArrowRight className="size-4 text-indigo-400" /></div></button>)}</div> : <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">{year ? `暂未收录 ${year} 年${subject ? '的'+subject : ''}试卷，可调整科目或年份。` : '该筛选范围暂未收录试卷，可调整科目或年份。'}</div>}
        {catalog && catalog.total > 12 && <div className="flex items-center justify-center gap-4"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><span className="text-xs text-slate-500">{page} / {Math.ceil(catalog.total / 12)}</span><Button variant="outline" disabled={page * 12 >= catalog.total} onClick={() => setPage(page + 1)}>下一页</Button></div>}
        <section className="rounded-xl bg-slate-100/60 p-4 text-xs leading-6 text-slate-500"><p>{catalog?.coverage}</p><p>考试年级优先采用标题明示的年级；未明示时仅按中考九年级、高考高三的考试阶段归类，地生等实际考试年级请核对原卷。</p><p>各年度实际收录：{[...new Set(catalog?.years.map(item=>item.year)||RECENT_EXAM_YEARS)].sort((a,b)=>b-a).map(year => `${year} 年 ${catalog?.years.filter(item => item.year === year).reduce((sum, item) => sum + item.count, 0) || 0} 份`).join(' · ')}</p></section>
    </main>;
}


