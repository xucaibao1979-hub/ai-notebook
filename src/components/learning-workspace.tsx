"use client";

import { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Sparkles, GraduationCap, BookOpen, Globe2, ArrowRight, Loader2, Check, ChevronDown, ExternalLink, Eye, Send, CheckCircle2, RotateCcw, Lightbulb, CalendarDays } from 'lucide-react';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { LearningExercise, LearningSetResponse, LearningRequest, learningDateKey } from '@/lib/learning';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { studyPreferences } from '@/lib/study-preferences';
import { generateWithProgress, pendingLearningTask, resumeLearningTask, retryLearningTask } from '@/lib/learning-stream';
import { FamilyShareButton } from '@/components/family-share-button';
import { DeletedExercises } from '@/components/deleted-exercises';
import { ExerciseTools } from '@/components/exercise-tools';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { GradeProfile, currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';
import { UnitLearning } from '@/components/unit-learning';
import { getPrintedChoiceLetters } from '@/lib/print-preview';

const difficultyOptions = [{ value: 'easy', label: '基础' }, { value: 'medium', label: '适中' }, { value: 'hard', label: '进阶' }, { value: 'harder', label: '挑战' }] as const;
const selectClass = 'h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

function messageFor(error: unknown) {
    return friendlyApiError(error);
}

function SelectField({ label, id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
    return <div className="space-y-2"><label htmlFor={id} className="text-sm font-medium text-slate-600">{label}</label><div className="relative"><select id={id} className={selectClass} {...props}>{children}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 size-4 text-slate-400" /></div></div>;
}

export function ExerciseCard({ exercise, index, setId, onChange }: { exercise: LearningExercise; index: number; setId: string; onChange: (exercise: LearningExercise) => void }) {
    const [answer, setAnswer] = useState(exercise.record?.userAnswer || '');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [aiExplanation, setAiExplanation] = useState(false);
    const [answerVisible, setAnswerVisible] = useState(false);
    const revealed = !!exercise.answerText || !!exercise.answerHtml;
    const choiceLetters = !exercise.options ? getPrintedChoiceLetters(exercise.questionText, exercise.questionHtml) : [];
    const inlineChoices = !exercise.options && (choiceLetters.length > 0 || /^[A-DＡ-Ｄ](?:\b|[.．、:：)）])/.test(exercise.correctOption?.trim() || ''));
    const isChoice = !!exercise.options || inlineChoices;
    const availableLetters = choiceLetters.length ? choiceLetters : ['A', 'B', 'C', 'D'];
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
            if (result.answerText || result.answerHtml) setAnswerVisible(true);
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
        {inlineChoices && <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="选择答案">{availableLetters.map(letter => <button key={letter} type="button" disabled={!!busy || !!exercise.record} onClick={() => setAnswer(letter)} aria-pressed={answer === letter} className={`min-h-10 min-w-12 rounded-xl border px-4 text-sm font-semibold transition-colors ${answer === letter ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-200'}`}>{letter}</button>)}</div>}
        {!isChoice && <div className="mt-5 space-y-2"><label htmlFor={`answer-${setId}-${index}`} className="text-sm text-slate-500">写下你的答案或解题思路</label><Textarea id={`answer-${setId}-${index}`} placeholder="先独立思考，再对照解析…" value={answer} onChange={e => setAnswer(e.target.value)} disabled={!!busy || !!exercise.record} maxLength={5000} className="min-h-24 rounded-xl border-slate-200" /></div>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
            {!exercise.record && <Button className="rounded-lg bg-indigo-500 hover:bg-indigo-600" onClick={() => act('submit')} disabled={!!busy || !answer.trim()}>{busy === 'submit' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}提交作答</Button>}
            <Button variant="ghost" disabled={!!busy} onClick={() => revealed ? setAnswerVisible(value => !value) : act('reveal')} className="text-slate-500"><Eye className="mr-2 size-4" />{answerVisible ? '隐藏答案' : '查看答案'}</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}
        {revealed && answerVisible && <div className="mt-6 space-y-4 rounded-xl bg-slate-50 p-4 sm:p-5">
            <div><h3 className="mb-2 text-sm font-semibold text-slate-700">参考答案</h3>{exercise.answerHtml ? <div className="library-question-content" dangerouslySetInnerHTML={{ __html: exercise.answerHtml }} /> : <MarkdownRenderer content={exercise.answerText || ''} />}</div>
            <div className="border-t border-slate-200 pt-4"><h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Lightbulb className="size-4 text-amber-500" />{aiExplanation ? 'AI解析' : '解析与易错点'}</h3><MarkdownRenderer content={exercise.analysis || ''} /></div>
            {exercise.options && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act('explain')}>{busy === 'explain' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}AI解析</Button>}
            {exercise.record && !exercise.options && exercise.record.isCorrect === null && <div className="space-y-3 border-t border-slate-200 pt-4"><p className="text-xs text-slate-500">开放题请对照参考答案，自评掌握情况后计入学习统计。</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('assess', true)}><Check className="mr-2 size-4" />已掌握</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={() => act('assess', false)}><RotateCcw className="mr-2 size-4" />还需练习</Button></div></div>}
        </div>}
        <details className="mt-5 border-t border-slate-100 pt-3 group">
            <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-slate-500 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />题目辅助与来源
            </summary>
            <ExerciseTools exercise={exercise} setId={setId} index={index} onAssessed={correct=>act('assess',correct)} />
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <span>来源：</span>{exercise.provenance.url ? <a href={exercise.provenance.url} target={exercise.provenance.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline">{exercise.provenance.name}<ExternalLink className="size-3" /></a> : <span>{exercise.provenance.name}</span>}
            {exercise.referenceSources?.map((reference,index)=>reference.url?<a key={`${reference.name}-${index}`} href={reference.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-500 hover:underline">参考 {index+1}：{reference.name}<ExternalLink className="size-3" /></a>:<span key={`${reference.name}-${index}`}>参考 {index+1}：{reference.name}</span>)}
            {exercise.provenance.originalId && <span>题号 {exercise.provenance.originalId}</span>}{exercise.provenance.evidenceId && <Link href={`/knowledge-library/diagnosis?subject=${encodeURIComponent(exercise.subject)}&topic=${encodeURIComponent(exercise.provenance.topicId || "")}`} className="text-indigo-700 underline">回看教材依据 · {exercise.provenance.textbook} {exercise.provenance.chapter}{exercise.provenance.page ? ` 第${exercise.provenance.page}页` : ""}</Link>}
            {exercise.provenance.license && <a href={exercise.provenance.licenseUrl || 'https://creativecommons.org/licenses/by-nc-sa/4.0/'} target="_blank" rel="noreferrer" className="hover:underline">{exercise.provenance.license}</a>}
            {exercise.knowledgePoints.map(tag => <span key={tag} className="rounded bg-slate-50 px-2 py-1 text-slate-500">{tag}</span>)}
            </div>
        </details>
    </article>;
}

export function LearningWorkspace({ mode }: { mode: 'daily' | 'ai' }) {
    const { data: session } = useSession();
    const daily = mode === 'daily';
    const autoStarted = useRef(false);
    const [source, setSource] = useState<'notebook' | 'network'>('notebook');
    const [publisher, setPublisher] = useState('');
    const [subject, setSubject] = useState<string>(daily ? '数学' : '语文');
    const [notebookId, setNotebookId] = useState('');
    const [notebooks, setNotebooks] = useState<{ id: string; name: string; _count?: { errorItems: number } }[]>([]);
    const [prompt, setPrompt] = useState('');
    const [knowledgePoint, setKnowledgePoint] = useState('');
    const [grade, setGrade] = useState('');
    const [volume, setVolume] = useState('');
    const [generationType, setGenerationType] = useState<'custom' | 'chapters' | 'paper'>('custom');
    const [customAiCount, setCustomAiCount] = useState(false);
    const [difficulty, setDifficulty] = useState<LearningRequest['difficulty']>('medium');
    const [count, setCount] = useState(3);
    const [customDailyCount, setCustomDailyCount] = useState(false);
    const [chapterCount, setChapterCount] = useState(6);
    const [paperSetCount, setPaperSetCount] = useState(1);
    const [set, setSet] = useState<LearningSetResponse | null>(null);
    const [exerciseView, setExerciseView] = useState(false);
    const [loading, setLoading] = useState(false);
    const [progress,setProgress]=useState('');
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState('');
    const [today, setToday] = useState('');
    const [bankStats, setBankStats] = useState<{ subject: string; papers: number; questions: number } | null>(null);
    const [bankSync, setBankSync] = useState<{ state: string; processed: number; discovered: number; imported: number } | null>(null);
    const [bankUpdating, setBankUpdating] = useState(false);
    const [bankMessage, setBankMessage] = useState('');
    const [recommendedGrade, setRecommendedGrade] = useState('');
    const [gradeProfileLoaded, setGradeProfileLoaded] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedUnitId, setSelectedUnitId] = useState('');
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const selectedUnitIdRef = useRef('');

    useEffect(() => {
        if (!daily) return;
        let active = true;
        const refresh = () => {
            apiClient.get<{ subject: string; papers: number; questions: number }>(`/api/learning/network-bank/summary?subject=${encodeURIComponent(subject)}`)
                .then(result => { if (active) setBankStats(result); }).catch(() => { if (active) setBankStats(null); });
            apiClient.get<typeof bankSync>('/api/knowledge-library/sync?source=other')
                .then(result => { if (active) setBankSync(result); }).catch(() => {});
        };
        refresh();
        const timer = window.setInterval(refresh, 10000);
        return () => { active = false; window.clearInterval(timer); };
    }, [daily, subject]);

    async function updateBank() {
        setBankUpdating(true); setBankMessage('');
        try {
            await apiClient.post('/api/knowledge-library/sync?source=other', {});
            setBankSync(previous => ({ state: 'running', processed: previous?.processed || 0, discovered: previous?.discovered || 0, imported: 0 }));
            setBankMessage('已开始检查其他公开来源；收录数量会在同步后更新。');
        } catch (cause) { setBankMessage(friendlyApiError(cause)); }
        finally { setBankUpdating(false); }
    }

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
        apiClient.get<GradeProfile & {studyPreferences?:string}>('/api/user').then(profile => { if (active) { const value = currentStudentGrade(profile); const preferences = studyPreferences(profile.studyPreferences); setRecommendedGrade(value ? STUDENT_GRADES[value] : ''); setPublisher(current => current || preferences.activePublisher); } }).catch(() => {}).finally(() => { if (active) setGradeProfileLoaded(true); });
        const urlParams=new URLSearchParams(window.location.search);
        const requestedSet = urlParams.get('set');
        const dailyPlanCount=Math.max(1,Math.min(12,Math.floor(Number(urlParams.get('count'))||3)));
        const freshPlan=(urlParams.has('count')||urlParams.has('subject')||urlParams.has('knowledgePoint')||urlParams.has('evidenceId')||urlParams.has('new')||urlParams.has('history'))&&!requestedSet;
        const requestedHistory=(urlParams.get('history')||'').slice(0,100);
        const requestedSubject=(urlParams.get('subject')||(daily ? '数学' : '语文')).slice(0,50);
        const requestedKnowledge=(urlParams.get('knowledgePoint')||'').slice(0,300);
        const requestedEvidence=(urlParams.get('evidenceId')||'').slice(0,100);
        const requestedGrade=(urlParams.get('grade')||'').slice(0,80);
        Promise.all([apiClient.get<typeof notebooks>('/api/notebooks'), mode === 'ai' && !requestedSet ? Promise.resolve(null as LearningSetResponse | null) : apiClient.get<LearningSetResponse | null>(requestedSet ? `/api/learning/sets?id=${encodeURIComponent(requestedSet)}` : `/api/learning/sets?mode=${mode}`)])
            .then(([notebooks, restored]) => {
                const saved=freshPlan?null:restored;
                if (!active) return;
                setNotebooks(notebooks); setSet(saved); setExerciseView(!!saved && (!daily || !!requestedSet));
                if (daily && saved?.parameters?.subject && ['语文', '数学', '英语'].includes(saved.parameters.subject)) {
                    setSubject(saved.parameters.subject);
                    if (saved.parameters.source === 'notebook' || saved.parameters.source === 'network') setSource(saved.parameters.source);
                    setNotebookId(saved.parameters.notebookId || '');
                }
                if (mode === 'ai' && freshPlan && !saved && !requestedSet && !pendingLearningTask('ai') && !autoStarted.current) {
                    autoStarted.current = true; setLoading(true);setSubject(requestedSubject);setKnowledgePoint(requestedKnowledge);setCount(dailyPlanCount);if(requestedGrade)setGrade(requestedGrade);
                    generateWithProgress(requestedHistory?{mode:'ai',source:'history',historySetId:requestedHistory,count:dailyPlanCount}:{ mode:'ai', source:'ai', subject:requestedSubject,knowledgePoint:requestedKnowledge,count:dailyPlanCount,...(requestedEvidence?{evidenceId:requestedEvidence}:{}),...(requestedGrade?{grade:requestedGrade}:{}) },stage=>{if(active)setProgress(stage);})
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
                    else { setCount(params.count || 3); if (daily) setCustomDailyCount(params.count > 10); }
                }
            }).catch(error => { if (active) setError(messageFor(error)); })
            .finally(() => { if (active) setInitialLoading(false); });
        return () => { active = false; };
    }, [mode, daily]);

    useEffect(() => {
        const pending = pendingLearningTask(mode);
        if (!pending || pending.failed) return;
        let active = true;
        setLoading(true);
        resumeLearningTask(pending.id, mode, stage => { if (active) setProgress(stage); })
            .then(result => { if (!active) return; setSet(result); setExerciseView(true); window.history.replaceState(null, '', `${mode === 'daily' ? '/daily' : '/ai-practice'}?set=${encodeURIComponent(result.id)}`); })
            .catch(error => { if (active) setError(messageFor(error)); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [mode]);

    async function generate() {
        setLoading(true); setError('');
        try {
            const result = await generateWithProgress({
                mode, source: daily ? source : 'ai', ...(subject ? { subject } : {}), ...(!daily && publisher ? { publisher } : {}),
                ...(daily && source === 'notebook' && notebookId ? { notebookId } : {}),
                prompt: daily ? '' : prompt, knowledgePoint: daily ? '' : knowledgePoint,
                grade: daily ? '' : grade || recommendedGrade, ...(!daily && volume ? { volume } : {}), difficulty: daily && source === 'network' ? 'medium' : difficulty, count,
                ...(daily ? { refreshId: crypto.randomUUID() } : {}),
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
    return <main className="mx-auto max-w-6xl space-y-5 p-4 pb-16 sm:p-6 md:p-8">
        {exerciseView && set && !loading && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-5"><div><p className="text-xs text-indigo-500">已保存的练习</p><h1 className="mt-1 text-xl font-semibold text-slate-800">{set.title}</h1><p className="mt-1 text-xs text-slate-500">可以继续作答、查看解析，也可以稍后从历史练习重新打开。</p></div><div className="flex flex-wrap gap-2">{daily && <Button onClick={generate}>重新获取今日推荐</Button>}<Button variant="outline" onClick={backToOptions}>返回出题设置</Button><Link href="/knowledge-library/history" className="inline-flex items-center rounded-md border px-4 text-sm text-indigo-600">历史练习</Link></div></div>}
        {(!exerciseView || daily && loading) && <>
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{daily ? '每日推荐' : 'AI练习'}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{daily ? '每天一组好题，把薄弱点练成你的得分点。' : '按教材范围选择知识点，生成练习并保存复习记录。'}</p></div>
            {daily && <div className="flex flex-col items-end gap-2"><div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500"><CalendarDays className="size-4 text-indigo-400" />{today || '今天'} · 每日更新</div><Link href="/knowledge-library/history" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">历史练习 <ArrowRight className="size-4" /></Link></div>}
        </header>
        <p className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-800">{recommendedGrade ? `当前年级：${recommendedGrade} · 跟随账户设置` : '尚未设置当前年级，可在账户设置中选择，也可在下方手动选择。'}</p>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            {daily ? <>
                <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-700">选择题目来源</h2><div className="flex items-center gap-2"><div className="group relative" data-testid="daily-subject-menu"><button type="button" aria-label={`每日推荐科目：${subject}`} aria-haspopup="true" disabled={loading} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-500">{subject}<ChevronDown className="size-4" /></button><div className="invisible absolute right-0 top-full z-20 min-w-28 pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"><div className="rounded-xl border border-slate-200 bg-white p-1 shadow-lg" role="group" aria-label="选择每日推荐科目">{(['语文', '数学', '英语'] as const).map(name => <button key={name} type="button" aria-pressed={subject === name} disabled={loading} onClick={() => { if (subject !== name) { setSubject(name); setNotebookId(''); setSet(null); setError(''); } }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-indigo-50 focus-visible:bg-indigo-50 ${subject === name ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}>{name}</button>)}</div></div></div><div className="flex items-center gap-2"><select id="daily-count" aria-label="每日推荐题目数" className="h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700" value={customDailyCount ? 'custom' : count} disabled={loading} onChange={event => { if (event.target.value === 'custom') { setCustomDailyCount(true); setCount(11); } else { setCustomDailyCount(false); setCount(Number(event.target.value)); } }}>{Array.from({ length: 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} 道题</option>)}<option value="custom">自定义数量</option></select>{customDailyCount && <input aria-label="自定义每日推荐题目数" type="number" min={1} max={12} value={count} disabled={loading} onChange={event => setCount(Math.max(1, Math.min(12, Number(event.target.value) || 1)))} className="h-10 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm" />}</div></div></div>
                <div className="mb-6 grid gap-3 sm:grid-cols-2">{([{ value: 'notebook', label: '我的错题本', description: `从${subject}错题知识点随机生成新题`, icon: BookOpen }, { value: 'network', label: '网络公开题库', description: `优先参考${subject}历年试卷高频与易错知识点，生成新题`, icon: Globe2 }] as const).map(item => <button key={item.value} onClick={() => { setSource(item.value); setNotebookId(''); }} disabled={loading} aria-pressed={source === item.value} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${source === item.value ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-200'}`}><item.icon className={`size-5 shrink-0 ${source === item.value ? 'text-indigo-500' : 'text-slate-400'}`} /><div className="flex-1"><p className="text-sm font-medium text-slate-700">{item.label}{item.value === 'network' && bankStats?.subject === subject && <span className="ml-2 text-xs font-normal text-slate-500">{bankStats.papers} 份 · {bankStats.questions} 题</span>}</p><p className="mt-1 text-xs text-slate-400">{item.description}</p></div>{source === item.value && <CheckCircle2 className="size-4 text-indigo-500" />}</button>)}</div>
                <div className="-mt-3 mb-5 flex flex-wrap items-center justify-end gap-2 text-xs">{bankSync?.state === 'running' && <span role="status" className="text-indigo-600">更新中 {bankSync.processed}/{bankSync.discovered} · 新增 {bankSync.imported} 份</span>}{session?.user?.role === 'admin' && <button type="button" onClick={updateBank} disabled={bankUpdating || bankSync?.state === 'running'} className="rounded-md border border-indigo-200 px-2 py-1 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">{bankUpdating ? '启动中…' : '更新题库'}</button>}{bankMessage && <span role="status" className="text-slate-600">{bankMessage}</span>}</div>
            </> : <>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-base font-semibold text-slate-900">选择教材与出题范围</h2><div className="flex items-center gap-2"><Link href="/knowledge-library/history" className="inline-flex min-h-10 items-center whitespace-nowrap rounded-lg border border-slate-200 px-3 text-sm text-indigo-700">历史练习</Link><Button type="button" variant="outline" className="min-h-10" aria-expanded={showFilters} aria-controls="learning-filters" onClick={() => setShowFilters(value => !value)}>筛选<ChevronDown className={`ml-2 size-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} /></Button></div></div>
            </>}
            {!daily && showFilters && <div id="learning-filters" className="space-y-5 rounded-xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
            {!daily && <><div className="space-y-2"><label htmlFor="practice-knowledge" className="text-sm font-medium text-slate-600">知识点 <span className="font-normal text-slate-400">· 选填</span></label><Input id="practice-knowledge" value={knowledgePoint} onChange={e => setKnowledgePoint(e.target.value)} disabled={loading} maxLength={300} placeholder="例如：一元二次方程、文言文虚词、英语时态…" className="h-11 rounded-xl border-slate-200" /></div>
            <div className="space-y-2"><label htmlFor="practice-prompt" className="text-sm font-medium text-slate-600">学习要求 <span className="font-normal text-slate-400">· 选填</span></label><Textarea id="practice-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} disabled={loading} maxLength={2000} placeholder="例如：围绕我容易混淆的概念，出几道贴近生活的应用题，并在解析中说明易错点。" className="min-h-24 rounded-xl border-slate-200" /><p className="text-xs text-slate-400">不填写也可以，AI 会从所选科目中随机选择知识点。</p></div></>}
            <div className="grid gap-4 sm:grid-cols-3">
                {daily && source === 'notebook' ? <SelectField id="daily-notebook" label="错题本" value={notebookId} disabled={loading} onChange={e => setNotebookId(e.target.value)}><option value="">全部错题本</option>{notebooks.filter(notebook => notebook.name === subject).map(notebook => <option key={notebook.id} value={notebook.id}>{notebook.name}（{notebook._count?.errorItems || 0} 题）</option>)}</SelectField>
                    : null}
                {!(daily && source === 'network') && <SelectField id="practice-difficulty" label="难度" value={difficulty} disabled={loading} onChange={e => setDifficulty(e.target.value as LearningRequest['difficulty'])}>{difficultyOptions.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</SelectField>}
            </div>
            {daily && source === 'network' && <p className="mt-4 text-xs leading-6 text-slate-400">优先使用已收录历年试卷中重复出现的考点与本人的易错知识点，随机生成{subject}新题；只有可核对的统计才标注“历史高频”，无数据时按年级课程范围出题，不冒充历年真题。</p>}
            </div>}
            {!daily && <div className="mt-6 border-t border-slate-100 pt-5">{gradeProfileLoaded ? <UnitLearning publisher={publisher} subject={subject} grade={grade || recommendedGrade} volume={volume} selectedId={selectedUnitId} selectedIds={selectedUnitIds} busy={loading || initialLoading} onPublisherChange={choosePublisher} onSubjectChange={chooseSubject} onGradeChange={chooseGrade} onVolumeChange={chooseVolume} onGenerate={generateUnit} onUnitChange={chooseUnit} onUnitIdsChange={setSelectedUnitIds} generationControls={<div className="group relative" data-testid="ai-generation-menu"><button type="button" aria-haspopup="true" disabled={loading} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-sm text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-500">出题类型与数量<ChevronDown className="size-4" /></button><div className="invisible absolute right-0 top-full z-30 w-64 pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"><div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"><label className="block text-sm text-slate-700">出题类型<select aria-label="选择出题类型" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2" value={generationType} onChange={event => { setGenerationType(event.target.value as 'custom' | 'chapters' | 'paper'); setError(''); }} disabled={loading}><option value="custom">生成专属练习</option><option value="chapters">按所选章节出题</option><option value="paper">试卷出题</option></select></label><label className="block text-sm text-slate-700">{generationType === 'paper' ? '出题套数（每套 6 题）' : '出题数量'}<select aria-label="选择出题数量" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2" value={generationType === 'paper' ? paperSetCount : customAiCount ? 'custom' : generationType === 'chapters' ? chapterCount : count} onChange={event => { if (event.target.value === 'custom') { setCustomAiCount(true); if (generationType === 'chapters') setChapterCount(11); else setCount(11); } else { setCustomAiCount(false); if (generationType === 'paper') setPaperSetCount(Number(event.target.value)); else if (generationType === 'chapters') setChapterCount(Number(event.target.value)); else setCount(Number(event.target.value)); } }} disabled={loading}>{Array.from({ length: generationType === 'paper' ? 2 : 10 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} {generationType === 'paper' ? '套' : '题'}</option>)}{generationType !== 'paper' && <option value="custom">自定义数量</option>}</select></label>{customAiCount && generationType !== 'paper' && <input type="number" aria-label="自定义出题数量" min={1} max={12} value={generationType === 'chapters' ? chapterCount : count} onChange={event => { const value = Math.max(1, Math.min(12, Number(event.target.value) || 1)); if (generationType === 'chapters') setChapterCount(value); else setCount(value); }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" />}{generationType === 'paper' && <p className="text-xs text-slate-500">试卷出题最多 2 套，每套 6 题。</p>}{generationType !== 'paper' && <p className="text-xs text-slate-500">自定义数量支持 1–12 题。</p>}</div></div></div>} /> : <p role="status" className="text-sm text-slate-500">正在读取账户年级…</p>}</div>}
            {!daily && <section className="mt-5 space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 sm:p-5" aria-labelledby="generation-title">
                <div><h2 id="generation-title" className="text-lg font-semibold text-slate-800">2 · 出题设置</h2><p className="mt-1 text-xs text-slate-500">沿用上方教材范围；难度可在“筛选”中调整。</p></div>
                <p className="text-sm text-slate-600">当前：{generationType === 'paper' ? `试卷出题 · ${paperSetCount} 套（每套 6 题）` : `${generationType === 'chapters' ? '按所选章节出题' : '生成专属练习'} · ${generationType === 'chapters' ? chapterCount : count} 题`}。可在上方“出题类型与数量”调整。</p>
                {generationType === 'custom' && <p className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm leading-6 text-sky-900">优先使用当前教材已核对的单元知识点；若没有，则按所选科目和年级的通用课程知识出题，题目不代表教材原文。可在“筛选”中补充学习要求。</p>}
                {generationType === 'chapters' && <p className="text-sm text-slate-600">已选 {selectedUnitIds.length} 个章节。请在上方“章节（可多选）”展开勾选，只会使用当前册别的章节。</p>}
                {generationType === 'paper' && <p className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">按上方出版社、科目、年级和册别组卷。已选 {selectedUnitIds.length} 个章节；未选章节时从当前筛选范围内所有已核对的知识点随机出题。每套 6 题，不依赖试卷库。</p>}
                <div className="flex flex-col gap-3 border-t border-indigo-100 pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">练习自动保存，生成后可下载或打印。</p><Button className="h-11 w-full rounded-xl bg-indigo-600 px-6 hover:bg-indigo-700 sm:w-auto" disabled={loading || initialLoading || !gradeProfileLoaded || (generationType === 'chapters' && !selectedUnitIds.length)} onClick={() => generationType === 'custom' ? generate() : generateScoped(generationType)}>{loading && <Loader2 className="mr-2 size-4 animate-spin" />}{loading ? '正在准备练习…' : generationType === 'custom' ? '生成专属练习' : generationType === 'chapters' ? '按所选章节出题' : '试卷出题'}{!loading && <ArrowRight className="ml-2 size-4" />}</Button></div>
            </section>}
            {daily && <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5"><p className="max-w-lg text-xs leading-6 text-slate-400">每次获取都会生成新题，并避开历史练习中的重复题目；旧题仍可在历史练习中查看。</p><Button onClick={generate} disabled={loading || initialLoading} className="h-11 rounded-xl bg-indigo-500 px-6 shadow-sm hover:bg-indigo-600">{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GraduationCap className="mr-2 size-4" />}{loading ? '正在准备练习…' : '获取今日推荐'}{!loading && <ArrowRight className="ml-2 size-4" />}</Button></div>}
        </section>
        </>}
        {error && <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-600">{error}{error.includes('AI') && <span> <button className="underline" onClick={() => window.dispatchEvent(new Event('open-app-settings'))}>打开设置</button></span>}{pendingLearningTask(mode) && <button className="ml-3 rounded-lg border border-red-200 bg-white px-3 py-1 text-red-700" disabled={loading} onClick={async () => { setLoading(true); setError(''); try { const result=await retryLearningTask(mode,setProgress); setSet(result); setExerciseView(true); window.history.replaceState(null,'',`${daily?'/daily':'/ai-practice'}?set=${encodeURIComponent(result.id)}`); } catch (failure) { setError(messageFor(failure)); } finally { setLoading(false); } }}>重试上次任务</button>}</div>}
        {loading && <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-indigo-100 bg-white p-8 text-sm text-slate-500"><Loader2 className="size-5 animate-spin text-indigo-500" />{progress||'正在准备练习…'}</div>}
        {initialLoading && <div role="status" className="p-8 text-center text-sm text-slate-400">正在恢复上次练习…</div>}
        {exerciseView && set && set.parameters && set.questions.length < set.parameters.count && !loading && <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm"><span>已保存 {set.questions.length}/{set.parameters.count} 题，其余题目未通过生成或校验。</span><Button variant="outline" onClick={async()=>{setLoading(true);setProgress('只重试缺少的题目…');try{setSet(await apiClient.post<LearningSetResponse>('/api/learning/retry',{setId:set.id},{timeout:300000}));}catch(e){setError(messageFor(e));}finally{setLoading(false);}}}>只补齐缺题</Button></div>}
        {exerciseView && set && !loading && <DeletedExercises set={set} onChange={setSet} />}
        {exerciseView && set && !loading && <section className="space-y-4"><div className="flex flex-wrap gap-4"><button className="text-sm text-indigo-600" onClick={downloadQuestions}>下载题目</button><a className="text-sm text-indigo-600" href={'/print-study?mode=sets&setId='+set.id} target="_blank" rel="noreferrer">打印 / 保存 PDF</a><FamilyShareButton id={set.id} kind="set"/></div>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-800">{set.title}</h2><p className="mt-1 text-xs text-slate-400">{set.createdAt ? `${new Date(set.createdAt).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})} · ` : set.dateKey ? `${set.dateKey} · ` : ''}{set.source === 'notebook' ? '错题变式' : set.source === 'network' ? '公开题库' : 'AI生成'} · 共 {activeCount} 题</p></div><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs text-indigo-500">已作答 {completed} / {activeCount}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70"><div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${activeCount ? completed / activeCount * 100 : 0}%` }} /></div>
            {set.questions.map((exercise, index) => !exercise.deleted && <ExerciseCard key={`${set.id}-${index}`} exercise={exercise} index={index} setId={set.id} onChange={updated => {setSet(previous => previous ? { ...previous, questions: previous.questions.map((question, current) => current === index ? updated : question) } : null);}} />)}
        </section>}
        {daily && !set && !loading && !initialLoading && <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center"><span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-300"><BookOpen className="size-6" /></span><p className="mt-4 text-sm font-medium text-slate-600">今天的进步，从这里开始</p><p className="mt-2 text-xs text-slate-400">选择上方选项，点击按钮开始练习。</p><Link href="/notebooks" className="mt-4 inline-flex text-xs text-indigo-500 hover:underline">先去整理我的错题本 <ArrowRight className="ml-1 size-3" /></Link></div>}
    </main>;
}
