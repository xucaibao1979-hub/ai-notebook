"use client";

import { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Sparkles, GraduationCap, BookOpen, Globe2, ArrowRight, Loader2, Check, ChevronDown, ExternalLink, Eye, Send, CheckCircle2, RotateCcw, Lightbulb, CalendarDays } from 'lucide-react';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { LEARNING_SUBJECTS, LearningExercise, LearningSetResponse, LearningRequest, learningDateKey } from '@/lib/learning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studyPreferences } from '@/lib/study-preferences';
import { generateWithProgress, pendingLearningTask, resumeLearningTask } from '@/lib/learning-stream';
import { FamilyShareButton } from '@/components/family-share-button';
import { DeletedExercises } from '@/components/deleted-exercises';
import { ExerciseTools } from '@/components/exercise-tools';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { GradeProfile, currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';
import { UnitLearning } from '@/components/unit-learning';

const difficultyOptions = [{ value: 'easy', label: '基础' }, { value: 'medium', label: '适中' }, { value: 'hard', label: '进阶' }, { value: 'harder', label: '挑战' }] as const;
const selectClass = 'h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function messageFor(error: unknown) {
    return friendlyApiError(error);
}

function SelectField({ label, id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
    return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium text-slate-600">{label}</label><div className="relative"><select id={id} className={selectClass} {...props}>{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-slate-400" /></div></div>;
}

function ExerciseCard({ exercise, index, setId, onChange }: { exercise: LearningExercise; index: number; setId: string; onChange: (exercise: LearningExercise) => void }) {
    const [answer, setAnswer] = useState(exercise.record?.userAnswer || '');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [aiExplanation, setAiExplanation] = useState(false);
    const revealed = !!exercise.answerText;
    async function manage(remove=false) {
        if(remove && !window.confirm('删除这道练习题？')) return;
        setBusy('manage');setError('');
        try {await apiClient.patch('/api/learning/sets/'+setId,{exerciseIndex:index,...(remove?{deleted:true}:{favorited:!exercise.favorited})});onChange({...exercise,...(remove?{deleted:true}:{favorited:!exercise.favorited})});}catch(e){setError(messageFor(e));}finally{setBusy('');}
    }
    async function act(action: 'submit' | 'reveal' | 'assess' | 'explain', isCorrect?: boolean) {
        setBusy(action); setError('');
        try {
            const result = await apiClient.post<Pick<LearningExercise, 'answerText' | 'answerHtml' | 'analysis' | 'record'> & { aiExplanation?: boolean }>('/api/learning/answer', { setId, index, action, userAnswer: answer, isCorrect }, { timeout: 180000 });
            onChange({ ...exercise, ...result });
            if (result.aiExplanation) setAiExplanation(true);
        } catch (error) { setError(messageFor(error)); }
        finally { setBusy(''); }
    }
    return <article id={`exercise-${index}`} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3"><button disabled={!!busy} onClick={() => manage()} className="text-xs text-indigo-500">{exercise.favorited ? '★ 已收藏' : '☆ 收藏'}</button><button disabled={!!busy} onClick={() => manage(true)} className="text-xs text-red-500">删除本题</button><span className="flex size-9 items-center justify-center rounded-xl bg-indigo-50 text-sm font-semibold text-indigo-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm font-medium text-slate-700">{exercise.subject}</span>{exercise.provenance.grade && <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-400">{exercise.provenance.grade}</span>}</div>
            {exercise.record && <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${exercise.record.isCorrect === true ? 'bg-emerald-50 text-emerald-600' : exercise.record.isCorrect === false ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-500'}`}><CheckCircle2 className="size-3.5" />{exercise.record.isCorrect === true ? '已掌握' : exercise.record.isCorrect === false ? '还需练习' : '已作答 · 待自评'}</span>}
        </div>
        {exercise.questionHtml ? <div className="library-question-content" dangerouslySetInnerHTML={{ __html: exercise.questionHtml }} /> : <MarkdownRenderer content={exercise.questionText} className="text-slate-800" />}
        {exercise.options && <div className="mt-5 grid gap-2 sm:grid-cols-2">{exercise.options.map((option, optionIndex) => {
            const letter = String.fromCharCode(65 + optionIndex);
            return <button key={letter} disabled={!!busy || !!exercise.record} onClick={() => setAnswer(letter)} aria-pressed={answer === letter} className={`flex items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${answer === letter ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-200'}`}><span className="mt-0.5 font-semibold">{letter}.</span><MarkdownRenderer content={option} /></button>;
        })}</div>}
        {!exercise.options && <div className="mt-5 space-y-2"><label htmlFor={`answer-${setId}-${index}`} className="text-sm text-slate-500">写下你的答案或解题思路</label><Textarea id={`answer-${setId}-${index}`} placeholder="先独立思考，再对照解析…" value={answer} onChange={e => setAnswer(e.target.value)} disabled={!!busy || !!exercise.record} maxLength={5000} className="min-h-24 rounded-xl border-slate-200" /></div>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
            {!exercise.record && <Button className="rounded-lg bg-indigo-500 hover:bg-indigo-600" onClick={() => act('submit')} disabled={!!busy || !answer.trim()}>{busy === 'submit' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}提交作答</Button>}
            {!revealed && <Button variant="ghost" disabled={!!busy} onClick={() => act('reveal')} className="text-slate-500"><Eye className="mr-2 size-4" />查看答案</Button>}
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        {revealed && <div className="mt-6 space-y-4 rounded-xl bg-slate-50 p-4 sm:p-5">
            <div><h3 className="mb-2 text-sm font-semibold text-slate-700">参考答案</h3>{exercise.answerHtml ? <div className="library-question-content" dangerouslySetInnerHTML={{ __html: exercise.answerHtml }} /> : <MarkdownRenderer content={exercise.answerText || ''} />}</div>
            <div className="border-t border-slate-200 pt-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Lightbulb className="size-4 text-amber-500" />{aiExplanation ? 'AI解析' : '解析与易错点'}</h3><MarkdownRenderer content={exercise.analysis || ''} /></div>
            {exercise.options && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act('explain')}>{busy === 'explain' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}AI解析</Button>}
            {exercise.record && !exercise.options && exercise.record.isCorrect === null && <div className="space-y-3 border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">开放题请对照参考答案，自评掌握情况后计入学习统计。</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('assess', true)}><Check className="mr-2 size-4" />已掌握</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('assess', false)}><RotateCcw className="mr-2 size-4" />还需练习</Button></div></div>}
        </div>}
        <ExerciseTools exercise={exercise} setId={setId} index={index} onAssessed={correct=>act('assess',correct)} />
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <span>来源：</span>{exercise.provenance.url ? <a href={exercise.provenance.url} target={exercise.provenance.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline">{exercise.provenance.name}<ExternalLink className="size-3" /></a> : <span>{exercise.provenance.name}</span>}
            {exercise.referenceSources?.map((reference,index)=>reference.url?<a key={`${reference.name}-${index}`} href={reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline">参考 {index+1}：{reference.name}<ExternalLink className="size-3" /></a>:<span key={`${reference.name}-${index}`}>参考 {index+1}：{reference.name}</span>)}
            {exercise.provenance.originalId && <span>题号 {exercise.provenance.originalId}</span>}
            {exercise.provenance.license && <a href={exercise.provenance.licenseUrl || 'https://creativecommons.org/licenses/by-nc-sa/4.0/'} target="_blank" rel="noreferrer" className="hover:underline">{exercise.provenance.license}</a>}
            {exercise.knowledgePoints.map(tag => <span key={tag} className="rounded bg-slate-50 px-2 py-1 text-slate-500">{tag}</span>)}
        </div>
    </article>;
}

export function LearningWorkspace({ mode }: { mode: 'daily' | 'ai' }) {
    const daily = mode === 'daily';
    const autoStarted = useRef(false);
    const [source, setSource] = useState<'notebook' | 'network'>('notebook');
    const [publisher, setPublisher] = useState('');
    const [subject, setSubject] = useState<string>('数学');
    const [notebookId, setNotebookId] = useState('');
    const [notebooks, setNotebooks] = useState<{ id: string; name: string; _count?: { errorItems: number } }[]>([]);
    const [prompt, setPrompt] = useState('');
    const [knowledgePoint, setKnowledgePoint] = useState('');
    const [grade, setGrade] = useState('');
    const [volume, setVolume] = useState('');
    const [generationType, setGenerationType] = useState<'custom' | 'chapters' | 'paper'>('custom');
    const [difficulty, setDifficulty] = useState<LearningRequest['difficulty']>('medium');
    const [count, setCount] = useState(3);
    const [chapterCount, setChapterCount] = useState(6);
    const [paperSetCount, setPaperSetCount] = useState(1);
    const [set, setSet] = useState<LearningSetResponse | null>(null);
    const [exerciseView, setExerciseView] = useState(false);
    const [loading, setLoading] = useState(false);
    const [progress,setProgress]=useState('');
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState('');
    const [today, setToday] = useState('');
    const [recommendedGrade, setRecommendedGrade] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const selectedUnitIdRef = useRef('');

    useEffect(() => {
        const syncView = () => {
            const id = new URLSearchParams(window.location.search).get('set');
            if (!id) { setExerciseView(false); return; }
            if (id === set?.id) { setExerciseView(true); return; }
            apiClient.get<LearningSetResponse | null>(`/api/learning/sets?id=${encodeURIComponent(id)}`)
                .then(restored => { if (restored) { setSet(restored); setExerciseView(true); } })
                .catch(error => setError(messageFor(error)));
        };
        window.addEventListener('popstate', syncView);
        return () => window.removeEventListener('popstate', syncView);
    }, [set?.id]);

    useEffect(() => {
        if (!exerciseView || !set || !/^#exercise-\d+$/.test(window.location.hash)) return;
        const timer = window.setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' }), 100);
        return () => window.clearTimeout(timer);
    }, [exerciseView, set]);

    useEffect(() => {
        let active = true;
        setToday(learningDateKey());
        apiClient.get<GradeProfile & {studyPreferences?:string}>('/api/user').then(profile => { if (active) { const value = currentStudentGrade(profile); const preferences = studyPreferences(profile.studyPreferences); setRecommendedGrade(value ? STUDENT_GRADES[value] : ''); setPublisher(current => current || preferences.activePublisher); } }).catch(() => {});
        const urlParams=new URLSearchParams(window.location.search);
        const requestedSet = urlParams.get('set');
        const dailyPlanCount=Math.max(1,Math.min(5,Math.floor(Number(urlParams.get('count'))||3)));
        const freshPlan=(urlParams.has('count')||urlParams.has('subject')||urlParams.has('knowledgePoint')||urlParams.has('new')||urlParams.has('history'))&&!requestedSet;
        const requestedHistory=(urlParams.get('history')||'').slice(0,100);
        const requestedSubject=(urlParams.get('subject')||'数学').slice(0,50);
        const requestedKnowledge=(urlParams.get('knowledgePoint')||'').slice(0,300);
        Promise.all([apiClient.get<typeof notebooks>('/api/notebooks'), mode === 'ai' && !requestedSet ? Promise.resolve(null as LearningSetResponse | null) : apiClient.get<LearningSetResponse | null>(requestedSet ? `/api/learning/sets?id=${encodeURIComponent(requestedSet)}` : `/api/learning/sets?mode=${mode}`)])
            .then(([notebooks, restored]) => {
                const saved=freshPlan?null:restored;
                if (!active) return;
                setNotebooks(notebooks); setSet(saved); setExerciseView(!!saved);
                if (mode === 'ai' && freshPlan && !saved && !requestedSet && !pendingLearningTask('ai') && !autoStarted.current) {
                    autoStarted.current = true; setLoading(true);setSubject(requestedSubject);setKnowledgePoint(requestedKnowledge);setCount(dailyPlanCount);
                    generateWithProgress(requestedHistory?{mode:'ai',source:'history',historySetId:requestedHistory,count:dailyPlanCount}:{ mode:'ai', source:'ai', subject:requestedSubject,knowledgePoint:requestedKnowledge,count:dailyPlanCount },stage=>{if(active)setProgress(stage);})
                        .then(result => {if(active) { setSet(result); setExerciseView(true); window.history.replaceState(null, '', `/ai-practice?set=${encodeURIComponent(result.id)}`); }})
                        .catch(e => {if(active) setError(messageFor(e));})
                        .finally(() => {if(active) setLoading(false);});
                }
                if (saved?.parameters) {
                    const params = saved.parameters;
                    if (params.source === 'notebook' || params.source === 'network') setSource(params.source);
                    setPublisher(params.publisher || ''); setSubject(params.subject || saved.questions[0]?.subject || '数学'); setNotebookId(params.notebookId || '');
                    setPrompt(params.prompt || ''); setKnowledgePoint(params.knowledgePoint || ''); setGrade(params.grade || ''); setVolume(params.volume || ''); setDifficulty(params.difficulty || 'medium');
                    if (params.paperSets || params.paperId) { setGenerationType('paper'); setPaperSetCount(params.paperSets || 1); setSelectedUnitIds(params.unitIds || []); }
                    else if (params.unitIds?.length) { setGenerationType('chapters'); setSelectedUnitIds(params.unitIds); setChapterCount(params.count || 6); }
                    else setCount(params.count || 3);
                }
            }).catch(error => { if (active) setError(messageFor(error)); })
            .finally(() => { if (active) setInitialLoading(false); });
        return () => { active = false; };
    }, [mode]);

    useEffect(() => {
        const pending = pendingLearningTask(mode);
        if (!pending) return;
        let active = true;
        setLoading(true);
        resumeLearningTask(pending.id, mode, stage => { if (active) setProgress(stage); })
            .then(result => { if (!active) return; setSet(result); setExerciseView(true); window.history.replaceState(null, '', `${mode === 'daily' ? '/daily' : '/ai-practice'}?set=${encodeURIComponent(result.id)}`); })
            .catch(error => { if (active) setError(messageFor(error)); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [mode]);

    async function generate() {
        setLoading(true); setError(''); setSet(null);
        try {
            const result = await generateWithProgress({
                mode, source: daily ? source : 'ai', ...(subject && (!daily || source === 'network') ? { subject } : {}), ...(!daily && publisher ? { publisher } : {}),
                ...(daily && source === 'notebook' && notebookId ? { notebookId } : {}),
                prompt: daily ? '' : prompt, knowledgePoint: daily ? '' : knowledgePoint,
                grade: daily ? '' : grade || recommendedGrade, ...(!daily && volume ? { volume } : {}), difficulty: daily && source === 'network' ? 'medium' : difficulty, count,
            },setProgress);
            setSet(result); setExerciseView(true); setToday(learningDateKey());
            window.history.pushState(null, '', `${daily ? '/daily' : '/ai-practice'}?set=${encodeURIComponent(result.id)}`);
        } catch (error) { setError(messageFor(error)); }
        finally { setLoading(false); }
    }
    async function generateUnit(unitId: string, unitMode: 'practice' | 'review') {
        setLoading(true); setProgress('正在准备单元内容…'); setError(''); setSet(null);
        try {
            const result = await generateWithProgress({ mode: 'ai', source: 'ai', publisher, subject, grade: grade || recommendedGrade, volume, unitId, unitMode, count, difficulty }, setProgress);
            setSet(result); setExerciseView(true);
            window.history.pushState(null, '', `/ai-practice?set=${encodeURIComponent(result.id)}`);
        } catch (error) { setError(messageFor(error)); }
        finally { setLoading(false); }
    }
    async function generateScoped(kind: 'chapters' | 'paper') {
        if (kind === 'chapters' && !selectedUnitIds.length) { setError('请先选择至少一个章节。'); return; }
        setLoading(true); setProgress(kind === 'paper' ? '正在根据筛选的知识点随机组卷…' : '正在按所选章节生成新题…'); setError(''); setSet(null);
        try {
            const result = await generateWithProgress({ mode: 'ai', source: 'ai', publisher, subject, grade: grade || recommendedGrade, difficulty, count: kind === 'paper' ? paperSetCount * 6 : chapterCount, volume, ...(kind === 'paper' ? { ...(selectedUnitIds.length ? { unitIds: selectedUnitIds } : {}), paperSets: paperSetCount } : { unitIds: selectedUnitIds, unitMode: 'practice' as const }) }, setProgress);
            setSet(result); setExerciseView(true);
            window.history.pushState(null, '', `/ai-practice?set=${encodeURIComponent(result.id)}`);
        } catch (error) { setError(messageFor(error)); }
        finally { setLoading(false); }
    }
    const chooseSubject = useCallback((name: string) => {
        if (subject !== name) { setSet(null); setError(''); }
        setVolume(''); setSelectedUnitIds([]);
        setSubject(name);
    }, [subject]);
    const choosePublisher = useCallback((name: string) => { setPublisher(name); setVolume(''); setSelectedUnitIds([]); setSet(null); setError(''); }, []);
    const chooseGrade = useCallback((name: string) => { setGrade(name); setVolume(''); setSelectedUnitIds([]); setSet(null); setError(''); }, []);
    const chooseVolume = useCallback((name: string) => { setVolume(name); setSelectedUnitIds([]); setSet(null); setError(''); }, []);
    const chooseUnit = useCallback((id: string) => {
        if (selectedUnitIdRef.current !== id) { setSet(null); setError(''); }
        selectedUnitIdRef.current = id;
        setSelectedUnitId(id);
    }, []);
    const completed = set?.questions.filter(question => question.record && !question.deleted).length || 0;
    const activeCount = set?.questions.filter(question => !question.deleted).length || 0;
    function backToOptions() {
        setExerciseView(false); setSet(null); setCount(3); setError('');
        window.history.pushState(null, '', daily ? '/daily' : '/ai-practice');
    }
    function downloadQuestions() {
        if (!set) return;
        const lines = [`# ${set.title}`, '', ...set.questions.filter(question => !question.deleted).flatMap((question, index) => [`## 第 ${index + 1} 题`, '', question.questionText, ...(question.options ? ['', ...question.options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`)] : []), '', '答：', '', ''])];
        const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `${set.title.replace(/[\\/:*?"<>|]/g, '-')}.md`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }
    return <main className="mx-auto max-w-6xl space-y-6 p-5 pb-16 md:p-8">
        {exerciseView && set && !loading && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5"><div><p className="text-xs text-indigo-500">已保存的练习</p><h1 className="mt-1 text-xl font-semibold text-slate-800">{set.title}</h1><p className="mt-1 text-xs text-slate-500">可以继续作答、查看解析，也可以稍后从历史练习重新打开。</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={backToOptions}>返回出题设置</Button><Link href="/knowledge-library/history" className="inline-flex items-center rounded-md border px-4 text-sm text-indigo-600">历史练习</Link></div></div>}
        {!exerciseView && <>
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="mb-2 text-xs font-medium uppercase tracking-wider text-indigo-500">{daily ? 'DAILY PICKS' : 'PRACTICE WITH AI'}</p><h1 className="text-3xl font-semibold tracking-tight text-slate-800">{daily ? '每日推荐' : 'AI练习'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{daily ? '每天一组好题，把薄弱点练成你的得分点。' : '默认按当前年级的课程知识点随机出题，也可以指定学习要求。'}</p></div>
            {daily ? <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500"><CalendarDays className="size-4 text-indigo-400" />{today || '今天'} · 每日更新</div> : <span className="rounded-full bg-indigo-50 px-4 py-2 text-xs text-indigo-500">按科目教材 + 自定义知识点</span>}
        </header>
        <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50">
            <p className="px-5 pt-4 text-xs text-indigo-600 sm:px-7">{recommendedGrade ? `当前推荐年级：${recommendedGrade} · 跟随账户设置` : '请在账户设置中选择当前年级，或在 AI练习中手动指定年级。'}</p>
            <div className="flex items-center gap-4 p-5 sm:p-7"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white shadow-lg shadow-indigo-200/50">{daily ? <GraduationCap className="size-6" /> : <Sparkles className="size-6" />}</span><div><h2 className="font-semibold text-slate-800">{daily ? '今天，从一次举一反三开始' : '按你的节奏，练出真正的理解'}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{daily ? '错题本按知识点直接生成；网络来源随机取 3 道公开题作为参考，再按当前年级生成新练习。' : '科目、知识点、学习要求自由组合。支持基础巩固、概念辨析和综合提升。'}</p></div></div>
        </section>
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
            {daily ? <>
                <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-700">选择题目来源</h2><Button type="button" variant="outline" aria-expanded={showFilters} aria-controls="learning-filters" onClick={() => setShowFilters(value => !value)}>筛选<ChevronDown className={`ml-2 size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} /></Button></div>
                <div className="mb-6 grid gap-3 sm:grid-cols-2">{([{ value: 'notebook', label: '我的错题本', description: '随机选取错题知识点，AI 直接出新题', icon: BookOpen }, { value: 'network', label: '网络公开题库', description: '随机参考 3 道公开题，AI 生成新练习', icon: Globe2 }] as const).map(item => <button key={item.value} onClick={() => { setSource(item.value); if (item.value === 'network' && subject === '其他') setSubject('数学'); }} disabled={loading} aria-pressed={source === item.value} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${source === item.value ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200'}`}><item.icon className={`size-5 shrink-0 ${source === item.value ? 'text-indigo-500' : 'text-slate-400'}`} /><div className="flex-1"><p className="text-sm font-medium text-slate-700">{item.label}</p><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>{source === item.value && <CheckCircle2 className="size-4 text-indigo-500" />}</button>)}</div>
            </> : <>
                <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-700">选择教材与出题范围</h2><div className="flex items-center gap-2"><Link href="/knowledge-library/history" className="rounded-lg border px-3 py-2 text-sm text-indigo-600">历史练习</Link><Button type="button" variant="outline" aria-expanded={showFilters} aria-controls="learning-filters" onClick={() => setShowFilters(value => !value)}>筛选<ChevronDown className={`ml-2 size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} /></Button></div></div>
            </>}
            {showFilters && <div id="learning-filters" className="space-y-5 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
            {!daily && <><div className="space-y-2"><label htmlFor="practice-knowledge" className="text-sm font-medium text-slate-600">知识点 <span className="font-normal text-slate-400">· 选填</span></label><Input id="practice-knowledge" value={knowledgePoint} onChange={e => setKnowledgePoint(e.target.value)} disabled={loading} maxLength={300} placeholder="例如：一元二次方程、文言文虚词、英语时态…" className="h-11 rounded-xl border-slate-200" /></div>
            <div className="space-y-2"><label htmlFor="practice-prompt" className="text-sm font-medium text-slate-600">学习要求 <span className="font-normal text-slate-400">· 选填</span></label><Textarea id="practice-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={loading} maxLength={2000} placeholder="例如：围绕我容易混淆的概念，出几道贴近生活的应用题，并在解析中说明易错点。" className="min-h-24 rounded-xl border-slate-200" /><p className="text-xs text-slate-400">不填写也可以，AI 会从所选科目中随机选择知识点。</p></div></>}
            <div className="grid gap-4 sm:grid-cols-3">
                {daily && source === 'notebook' ? <SelectField id="daily-notebook" label="错题本" value={notebookId} disabled={loading} onChange={e => setNotebookId(e.target.value)}><option value="">全部错题本</option>{notebooks.map(notebook => <option key={notebook.id} value={notebook.id}>{notebook.name}（{notebook._count?.errorItems || 0} 题）</option>)}</SelectField>
                    : daily ? <SelectField id="network-subject" label="科目" value={subject} disabled={loading} onChange={e => setSubject(e.target.value)}><option value="">随机科目</option>{LEARNING_SUBJECTS.filter(name => name !== '其他').map(name => <option key={name} value={name}>{name}</option>)}</SelectField>
                        : null}
                {!(daily && source === 'network') && <SelectField id="practice-difficulty" label="难度" value={difficulty} disabled={loading} onChange={e => setDifficulty(e.target.value as LearningRequest['difficulty'])}>{difficultyOptions.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</SelectField>}
                {daily && <SelectField id="practice-count" label="题目数量" value={count} disabled={loading} onChange={e => setCount(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(count => <option key={count} value={count}>{count} 道题</option>)}</SelectField>}
            </div>
            {daily && source === 'network' && <p className="mt-4 text-xs leading-6 text-slate-400">随机选取 3 道公开题作参考，按当前年级生成新练习；参考题的来源会显示在结果中。</p>}
            </div>}
            {!daily && <div className="mt-6 border-t border-slate-100 pt-5"><UnitLearning publisher={publisher} subject={subject} grade={grade || recommendedGrade} volume={volume} selectedId={selectedUnitId} selectedIds={selectedUnitIds} busy={loading || initialLoading} onPublisherChange={choosePublisher} onSubjectChange={chooseSubject} onGradeChange={chooseGrade} onVolumeChange={chooseVolume} onGenerate={generateUnit} onUnitChange={chooseUnit} onUnitIdsChange={setSelectedUnitIds} /></div>}
            {!daily && <section className="mt-6 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5" aria-labelledby="generation-title">
                <div><h2 id="generation-title" className="text-lg font-semibold text-slate-800">出题设置</h2><p className="mt-1 text-xs text-slate-500">出版社、科目、年级和册别沿用上方筛选；难度可在“筛选”中调整。</p></div>
                <div className="grid gap-3 sm:max-w-2xl sm:grid-cols-2"><label className="block text-sm font-medium text-slate-700">出题类型<select aria-label="选择出题类型" className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={generationType} onChange={event => { setGenerationType(event.target.value as 'custom' | 'chapters' | 'paper'); setError(''); }} disabled={loading}><option value="custom">生成专属练习</option><option value="chapters">按所选章节出题</option><option value="paper">试卷出题</option></select></label><label className="block text-sm font-medium text-slate-700">出题数量<div className="mt-2 flex items-center gap-2"><input aria-label="出题数量" type="number" min={1} max={generationType === 'paper' ? 2 : 12} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" value={generationType === 'custom' ? count : generationType === 'chapters' ? chapterCount : paperSetCount} onChange={event => { const value = Math.max(1, Math.min(generationType === 'paper' ? 2 : 12, Number(event.target.value) || 1)); if (generationType === 'custom') setCount(value); else if (generationType === 'chapters') setChapterCount(value); else setPaperSetCount(value); }} disabled={loading} /><span className="shrink-0 text-sm text-slate-500">{generationType === 'paper' ? '套（每套 6 题）' : '题'}</span></div></label></div>
                {generationType === 'custom' && <p className="text-sm text-slate-600">从当前册别已录入的知识点随机出题；也可在“筛选”中填写知识点和学习要求。</p>}
                {generationType === 'chapters' && <p className="text-sm text-slate-600">已选 {selectedUnitIds.length} 个章节。请在上方“章节（可多选）”展开勾选，只会使用当前册别的章节。</p>}
                {generationType === 'paper' && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">按上方出版社、科目、年级和册别组卷。已选 {selectedUnitIds.length} 个章节；未选章节时从当前筛选范围内所有已核对的知识点随机出题。每套 6 题，不依赖试卷库。</p>}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo-100 pt-4"><p className="text-xs text-slate-500">生成后自动保存到历史练习，可下载题目或打印、保存 PDF。</p><Button className="h-11 rounded-xl bg-indigo-500 px-6 hover:bg-indigo-600" disabled={loading || initialLoading || (generationType === 'chapters' && !selectedUnitIds.length)} onClick={() => generationType === 'custom' ? generate() : generateScoped(generationType)}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{loading ? '正在准备练习…' : generationType === 'custom' ? '生成专属练习' : generationType === 'chapters' ? '按所选章节出题' : '试卷出题'}{!loading && <ArrowRight className="ml-2 size-4" />}</Button></div>
            </section>}
            {daily && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5"><p className="max-w-lg text-xs leading-6 text-slate-400">每天按所选来源和数量生成一组题，同一组选项当天保持不变。</p><Button onClick={generate} disabled={loading || initialLoading} className="h-11 rounded-xl bg-indigo-500 px-6 shadow-sm hover:bg-indigo-600">{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GraduationCap className="mr-2 size-4" />}{loading ? '正在准备练习…' : '获取今日推荐'}{!loading && <ArrowRight className="ml-2 size-4" />}</Button></div>}
        </section>
        </>}
        {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-600">{error}{error.includes('AI') && <span> <button className="underline" onClick={() => window.dispatchEvent(new Event('open-app-settings'))}>打开设置</button></span>}</div>}
        {loading && <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-indigo-100 bg-white p-8 text-sm text-slate-500"><Loader2 className="size-5 animate-spin text-indigo-500" />{progress||'正在准备练习…'}</div>}
        {initialLoading && <div role="status" className="p-8 text-center text-sm text-slate-400">正在恢复上次练习…</div>}
        {exerciseView && set && set.parameters && set.questions.length < set.parameters.count && !loading && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm"><span>已保存 {set.questions.length}/{set.parameters.count} 题，其余题目未通过生成或校验。</span><Button variant="outline" onClick={async()=>{setLoading(true);setProgress('只重试缺少的题目…');try{setSet(await apiClient.post<LearningSetResponse>('/api/learning/retry',{setId:set.id},{timeout:300000}));}catch(e){setError(messageFor(e));}finally{setLoading(false);}}}>只补齐缺题</Button></div>}
        {exerciseView && set && !loading && <DeletedExercises set={set} onChange={setSet} />}
        {exerciseView && set && !loading && <section className="space-y-4"><div className="flex flex-wrap gap-4"><button className="text-sm text-indigo-600" onClick={downloadQuestions}>下载题目</button><a className="text-sm text-indigo-600" href={'/print-study?mode=sets&setId='+set.id} target="_blank" rel="noreferrer">打印 / 保存 PDF</a><FamilyShareButton id={set.id} kind="set"/></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-800">{set.title}</h2><p className="mt-1 text-xs text-slate-400">{set.createdAt ? `${new Date(set.createdAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})} · ` : set.dateKey ? `${set.dateKey} · ` : ''}{set.source === 'notebook' ? '错题变式' : set.source === 'network' ? '公开题库' : 'AI生成'} · 共 {activeCount} 题</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs text-indigo-500">已作答 {completed} / {activeCount}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${activeCount ? completed / activeCount * 100 : 0}%` }} /></div>
            {set.questions.map((exercise, index) => !exercise.deleted && <ExerciseCard key={`${set.id}-${index}`} exercise={exercise} index={index} setId={set.id} onChange={updated => {setSet(previous => previous ? { ...previous, questions: previous.questions.map((question, current) => current === index ? updated : question) } : null);}} />)}
        </section>}
        <Link href="/knowledge-library/history" className="inline-flex text-sm text-indigo-600">打开知识库 · 练习历史与收藏</Link>
        {!set && !loading && !initialLoading && <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-300"><BookOpen className="size-6" /></span><p className="mt-4 text-sm font-medium text-slate-600">{daily ? '今天的进步，从这里开始' : '你的专属练习，还差一步'}</p><p className="mt-2 text-xs text-slate-400">选择上方选项，点击按钮开始练习。</p>{daily && <Link href="/notebooks" className="mt-4 inline-flex text-xs text-indigo-500 hover:underline">先去整理我的错题本 <ArrowRight className="ml-1 size-3" /></Link>}</div>}
    </main>;
}







