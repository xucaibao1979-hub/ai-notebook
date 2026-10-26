import {prepareErrorSolution} from './error-solution';
import { createHash } from 'crypto';
import { prisma } from './prisma';
import { getAIService } from './ai';
import { LEARNING_SUBJECTS, LearningExercise, LearningRequest, buildLearningBrief, learningDateKey, shuffleQuestions } from './learning';
import { loadPublicQuestions } from './public-question-bank';
import { currentStudentGrade, STUDENT_GRADES } from './student-grade';
import { usableForRecommendation } from './paper-quality';
import { curriculumBrief, curriculumSubject, curriculumSummary, studyPreferences } from './study-preferences';
import { modelErrorMessage } from './ai/error-message';
import { validateExercise, structuralIssues } from './exercise-validation';
import { recommendationScore } from './recommendation';
import type { LibraryQuestion } from './knowledge-library';

export class LearningError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

/** Daily recommendations use one AI generation and one quality review per item, in parallel. */
async function generateDailyExercises(userId:string,request:LearningRequest,grade:string|null,studentGrade:number|null,userPreferences:string|undefined,progress?: (stage:string)=>void):Promise<LearningExercise[]>{
    let notebookItems:Awaited<ReturnType<typeof prisma.errorItem.findMany<{include:{subject:{select:{name:true}},tags:{select:{name:true}},reviewSchedules:true}}>>> = [];
    let references:LearningExercise[]=[];
    if(request.source==='notebook'){
        if(request.notebookId){const notebook=await prisma.subject.findFirst({where:{id:request.notebookId,userId}});if(!notebook)throw new LearningError('错题本不存在或无权访问',404);}
        notebookItems=await prisma.errorItem.findMany({where:{userId,archivedAt:null,...(request.notebookId?{subjectId:request.notebookId}:{}),questionText:{not:null}},include:{subject:{select:{name:true}},tags:{select:{name:true}},reviewSchedules:true}});
        notebookItems=shuffleQuestions(notebookItems.filter(item=>item.questionText?.trim()));
        if(!notebookItems.length)throw new LearningError('这个错题本还没有可出题的内容，先录入一道错题，或切换到网络题库。');
    }else{
        if(!studentGrade)throw new LearningError('请先在账户设置中选择当前年级，再获取年级匹配的作业。',422);
        const subject=request.subject||shuffleQuestions([...LEARNING_SUBJECTS.filter(name=>name!=='其他')])[0];
        if(studentGrade<=11){
            const papers=await prisma.knowledgePaper.findMany({where:{subject,examType:studentGrade<=9?'zhongkao':'gaokao'},select:{title:true,sourceUrl:true,questions:true,subject:true}});
            references=papers.flatMap(paper=>{
                let questions:LibraryQuestion[]=[];try{questions=JSON.parse(paper.questions) as LibraryQuestion[];}catch{return [];}
                return questions.filter(q=>!q.wholePaper&&!q.answerLeakRisk&&q.grade!==null&&q.grade<=studentGrade&&(studentGrade<=9?q.grade<=9:q.grade>=10)&&usableForRecommendation(q)).map(q=>({questionText:q.correctedMarkdown||q.questionHtml.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '),answerText:q.correctedAnswerMarkdown||q.answerHtml.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '),analysis:'公开试卷参考答案',subject,knowledgePoints:q.knowledgePoints,difficulty:request.difficulty,provenance:{name:`${paper.title} · 第 ${q.number} 题`,url:paper.sourceUrl,grade:STUDENT_GRADES[q.grade!]}}));
            });
        }
        if(references.length<3){
            try{references=[...references,...(await loadPublicQuestions(subject)).filter(q=>!structuralIssues({questionText:q.questionText,answerText:q.answerText,analysis:q.analysis||'公开题库'}).length)];}catch{if(!references.length)throw new LearningError('公开题库暂无可用参考题，请更换科目或使用错题本来源。',422);}
        }
        references=shuffleQuestions(references).filter((q,index,list)=>list.findIndex(item=>item.questionText.trim()===q.questionText.trim())===index).slice(0,3);
        if(references.length<3)throw new LearningError('公开题库不足 3 道可用参考题，请更换科目或使用错题本来源。',422);
    }
    let ai;
    try{ai=getAIService('generate',userId);}catch{throw new LearningError('请先在设置中启用出题模型。',422);}
    let completed=0;
    progress?.(request.source==='notebook'?'按错题知识点生成练习':'随机抽取 3 道公开题作为参考');
    const work=Array.from({length:request.count},async(_,index)=>{
        const original=notebookItems.length?notebookItems[index%notebookItems.length]:null;
        const subject=original?.subject?.name||request.subject||references[0]?.subject||'数学';
        const tags=original?.tags.map(tag=>tag.name).filter(Boolean)||references.flatMap(q=>q.knowledgePoints).filter(Boolean).slice(0,5);
        const topic=tags.length?tags.join('、'):original?`从这道错题概括知识点：${original.questionText?.slice(0,300)}`:`${grade||'当前年级'}${subject}课程范围内的常见易错知识点`;
        const variation=shuffleQuestions(['基础巩固','概念辨析','条件变化','生活情境应用','综合推理'])[index%5];
        const referenceBrief=references.length?`\n以下${references.length}道公开题仅供参考题型和知识点，不能照抄；若超出当前年级，必须改为当前年级内容：\n`+references.map((q,i)=>`${i+1}. ${q.questionText.slice(0,450)}；答案：${q.answerText?.slice(0,120)||'待核对'}`).join('\n'):'';
        const brief=`请按${grade||'当前年级'}${subject}的知识点“${topic}”原创一道可独立作答的练习题。题型：${variation}。不要复述原错题或参考题，不使用未提供的图、音频和材料。给出准确答案、简要解析与易错点。${referenceBrief}\n${curriculumBrief(userPreferences,subject,grade)}`;
        let lastError:unknown;
        for(let attempt=0;attempt<2;attempt++)try{
            const generated=await ai.generateSimilarQuestion(brief,[subject,...tags].slice(0,5),'zh',request.difficulty,grade||original?.gradeSemester);
            const exercise:LearningExercise={questionText:generated.questionText,answerText:generated.answerText,analysis:generated.analysis,subject,knowledgePoints:generated.knowledgePoints?.length?generated.knowledgePoints:tags,difficulty:request.difficulty,provenance:original?{name:`错题知识点 · ${topic.slice(0,50)}`,url:`/error-items/${original.id}`,originalId:original.id,grade:grade||undefined}:{name:`公开题库 ${references.length} 题参考 · AI 变式`,grade:grade||undefined},referenceSources:references.length?references.map(q=>({name:q.provenance?.name||'公开题库',url:q.provenance?.url})):undefined,recommendationReason:original?'根据错题本知识点随机生成':`随机参考公开题库中的 ${references.length} 道题生成`};
            exercise.provenance.curriculum=curriculumSummary(userPreferences,subject);
            exercise.validation=await validateExercise(exercise,grade||'当前年级',curriculumBrief(userPreferences,subject,grade),userId);
            progress?.(`已完成 ${++completed}/${request.count} 题`);
            return exercise;
        }catch(error){lastError=error;}
        throw lastError;
    });
    const settled=await Promise.allSettled(work);
    const results=settled.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
    if(!results.length){const first=settled.find(result=>result.status==='rejected');throw new LearningError('没有题目通过生成与质量校验：'+(first?.status==='rejected'&&first.reason instanceof Error?first.reason.message:'请重试'),502);}
    return results.filter((q,index)=>results.findIndex(other=>other.questionText.trim()===q.questionText.trim())===index);
}

const pendingDailySets = new Map<string, Promise<Awaited<ReturnType<typeof createLearningSet>>>>();

export async function generateExercises(userId: string, request: LearningRequest, progress?: (stage:string)=>void): Promise<LearningExercise[]> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { currentGrade: true, educationStage: true, enrollmentYear: true, studyPreferences: true } });
    const studentGrade = currentStudentGrade(user || {});
    const grade = request.grade || (studentGrade ? STUDENT_GRADES[studentGrade] : null);
    if(request.mode==='daily')return generateDailyExercises(userId,request,grade,studentGrade,user?.studyPreferences||undefined,progress);
    const requestedUnits = studyPreferences(user?.studyPreferences).studyUnits.filter(unit => (request.unitIds?.includes(unit.id) || request.unitId === unit.id) && unit.subject === request.subject && unit.grade === grade && (!request.publisher || unit.publisher === request.publisher) && (!request.volume || unit.volume === request.volume));
    const requestedUnit = requestedUnits[0] || null;
    const unitFocuses = requestedUnit ? shuffleQuestions(request.unitMode === 'review' && requestedUnit.entries.some(entry => !entry.mastered) ? requestedUnit.entries.filter(entry => !entry.mastered) : requestedUnit.entries.length ? requestedUnit.entries : requestedUnit.lessons.map(lesson => ({ kind: '知识点' as const, term: lesson.title, meaning: '目录课目主题，未提供课文原文', mastered: false }))) : [];

    let originals: { masteryLevel:number;createdAt:Date;reviewSchedules:{scheduledFor:Date;completedAt:Date|null;isCorrect:boolean|null}[]; id: string; questionText: string | null; gradeSemester: string | null; subject: { name: string } | null; tags: { name: string }[] }[] = [];
    let historyQuestions:LearningExercise[]=[];
    let paperTitle = '';
    if (request.paperId) {
        const paper = await prisma.knowledgePaper.findUnique({ where: { id: request.paperId }, select: { title: true, subject: true, sourceUrl: true, questions: true } });
        if (!paper || paper.subject !== request.subject) throw new LearningError('所选试卷与当前科目不匹配，请重新选择', 422);
        paperTitle = paper.title;
        const selectedGrade = Number(Object.entries(STUDENT_GRADES).find(([, label]) => label === grade)?.[0] || studentGrade || 0);
        const candidates = (JSON.parse(paper.questions) as LibraryQuestion[]).filter(question => !question.wholePaper && usableForRecommendation(question) && question.grade !== null && (!selectedGrade || question.grade <= selectedGrade) && (question.correctedMarkdown || question.questionHtml));
        historyQuestions = shuffleQuestions(candidates).map(question => ({ questionText: question.correctedMarkdown || question.questionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), answerText: question.correctedAnswerMarkdown || question.answerHtml.replace(/<[^>]+>/g, ' '), analysis: '', subject: paper.subject, knowledgePoints: question.knowledgePoints, difficulty: request.difficulty, provenance: { name: paper.title, url: paper.sourceUrl } }));
        if (!historyQuestions.length) throw new LearningError('这份试卷暂无经过质量筛选且适合当前年级的单题，请更换试卷', 422);
    }
    if(request.source==='history'){
        const source=await prisma.learningSet.findFirst({where:{id:request.historySetId,userId,archivedAt:null},select:{questions:true,deletedIndices:true}});
        if(!source)throw new LearningError('历史练习不存在或无权访问',404);
        const deleted=new Set<number>(JSON.parse(source.deletedIndices||'[]'));
        historyQuestions=shuffleQuestions((JSON.parse(source.questions) as LearningExercise[]).filter((q,index)=>!deleted.has(index)&&q.questionText?.trim()));
        if(!historyQuestions.length)throw new LearningError('这组历史练习没有可用于出题的题目',422);
    }
    if (request.source === 'notebook') {
        if (request.notebookId) {
            const notebook = await prisma.subject.findFirst({ where: { id: request.notebookId, userId } });
            if (!notebook) throw new LearningError('错题本不存在或无权访问', 404);
        }
        originals = await prisma.errorItem.findMany({
            where: { userId, archivedAt:null, ...(request.notebookId ? { subjectId: request.notebookId } : {}), questionText: { not: null } },
            include: { subject: { select: { name: true } }, tags: { select: { name: true } }, reviewSchedules:true },
        });
        originals = shuffleQuestions(originals.filter(item => item.questionText?.trim())).sort((a,b)=>recommendationScore(b).score-recommendationScore(a).score);
        if (!originals.length) throw new LearningError('这个错题本还没有可出题的内容，先录入一道错题，或切换到网络题库。');
    }

    let ai;
    try { ai = getAIService('generate',userId); }
    catch { throw new LearningError('请在左下角熊猫图标的“大模型服务”中选择并启用已配置的模型，再开始出题。', 422); }
    const variations = shuffleQuestions(['生活情境应用题', '概念辨析题', '条件变化与推理题', '基础巩固题', '多步骤综合题']);
    const results: LearningExercise[] = [];
    const failures:string[]=[];
    for (let index=0;index<request.count;index++) {
      for(let attempt=0;attempt<2;attempt++){
       try {
        progress?.(`生成第 ${index+1}/${request.count} 题${attempt?'（重试）':''}`);
        const original = originals.length ? originals[index % originals.length] : null;
        const historyOriginal=historyQuestions.length?historyQuestions[index%historyQuestions.length]:null;
        const rawSubject = original?.subject?.name || historyOriginal?.subject || request.subject || '其他';
        const subject = LEARNING_SUBJECTS.find(name => rawSubject.includes(name)) || curriculumSubject(rawSubject) || '其他';
        const exerciseUnit = requestedUnits.length ? requestedUnits[index % requestedUnits.length] : requestedUnit;
        const exerciseFocuses = exerciseUnit && exerciseUnit !== requestedUnit ? shuffleQuestions(exerciseUnit.entries) : unitFocuses;
        const unitFocus = exerciseFocuses.length ? exerciseFocuses[index % exerciseFocuses.length] : null;
        const tags = original?.tags.map(tag => tag.name) || historyOriginal?.knowledgePoints || (unitFocus ? [exerciseUnit!.title, unitFocus.term] : request.knowledgePoint ? request.knowledgePoint.split(/[，,、]/).map(tag => tag.trim()).filter(Boolean).slice(0, 5) : []);
        const solution=original?await prepareErrorSolution(userId,original.id):null;
        const brief = historyOriginal
            ? `当前年级：${grade||'参考原题年级'}。学科：${subject}。根据这道${request.paperId ? '试卷' : '历史练习'}题的知识点和解题方法，随机创作一道全新、可独立作答的${variations[index]}，不能照抄原题，不依赖图片或音频。\n参考题：${historyOriginal.questionText.slice(0,1500)}\n参考答案：${historyOriginal.answerText?.slice(0,500)||'未保存'}\n知识点：${tags.join('、')||'从题干归纳'}。`
            : original
            ? `当前年级：${grade || '参考原题年级'}。请严格在当前年级课程范围内出题。学科：${subject}。针对下面错题举一反三，改变条件或情境，不要照抄原题。新题必须自包含，不依赖外部图片。针对不同的变式要求：${variations[index]}。\n原错题：\n${original.questionText}\n已经独立核对的正确答案：${solution?.answerText}\n原题解题思路：${solution?.analysis}`
            : buildLearningBrief({ ...request, subject, grade: grade || '' }, unitFocus ? `${exerciseUnit!.title}中的${unitFocus.kind}：${unitFocus.term}（${unitFocus.meaning}）。请针对这一条随机变化题型和情境，勿重复其他题。` : tags.join('、') || `从${grade || '当前年级'}的${subject}课程知识点中随机选取，严格遵循该年级课程范围，不使用高年级知识；每题选择不同知识点`, variations[index]);
        const curriculum = exerciseUnit ? `当前出题教材与单元：${[exerciseUnit.region, exerciseUnit.publisher, exerciseUnit.textbook, exerciseUnit.grade, exerciseUnit.volume, exerciseUnit.title].filter(Boolean).join(' · ')}。只能使用该单元已录入的学习内容，不得套用其他出版社或册别。` : curriculumBrief(user?.studyPreferences,subject,grade,request.publisher);
        const generated = await ai.generateSimilarQuestion(brief+'\n'+curriculum, [subject, ...tags].slice(0, 5), 'zh', request.difficulty, grade || original?.gradeSemester);
        if (!generated.questionText?.trim() || !generated.answerText?.trim() || !generated.analysis?.trim()) {
            throw new LearningError('AI 返回的题目不完整，请重新生成', 502);
        }
        if (original && generated.questionText.trim() === original.questionText?.trim()) {
            throw new LearningError('AI 未生成新的变式题，请重新生成', 502);
        }
        const exercise:LearningExercise = {
            questionText: generated.questionText, answerText: generated.answerText, analysis: generated.analysis,
            subject, knowledgePoints: generated.knowledgePoints?.length ? generated.knowledgePoints : tags,
            difficulty: request.difficulty,
            provenance: historyOriginal
                ? request.paperId ? {name:`试卷「${paperTitle}」 · AI 变式`,url:`/knowledge-library/${request.paperId}`,originalId:request.paperId,grade:grade||undefined} : {name:'历史练习知识点 · AI 新题',url:`/ai-practice?set=${request.historySetId}`,originalId:request.historySetId,grade:grade||undefined}
                : original
                ? { name: `来自「${original.subject?.name || '我的错题本'}」的 AI 变式`, url: `/error-items/${original.id}`, originalId: original.id, grade: grade || original.gradeSemester || undefined }
                : { name: request.unitId || request.unitIds?.length ? `单元${request.unitMode === 'review' ? '复习' : '练习'} · AI 出题` : 'AI 按学习要求生成', grade: grade || undefined },
        };
        exercise.provenance.curriculum=exerciseUnit ? curriculum : curriculumSummary(user?.studyPreferences,subject,request.publisher);
        progress?.(`校验第 ${index+1}/${request.count} 题`);
        exercise.validation=await validateExercise(exercise,grade||'当前年级',curriculum,userId);
        if(original)exercise.recommendationReason=recommendationScore(original).reason;
        if(results.some(q=>q.questionText.trim()===exercise.questionText.trim()))throw new Error('题目重复');
        results.push(exercise);break;
       }catch(e){if(e instanceof Error&&/AI_AUTH_ERROR|AI_QUOTA_EXCEEDED|AI_NOT_FOUND|AI_PERMISSION_DENIED/.test(e.message)){if(!results.length)throw new LearningError(modelErrorMessage(e),422);return results;}if(attempt===1)failures.push(e instanceof Error&&/AI_[A-Z_]+|fetch failed|timeout/i.test(e.message)?modelErrorMessage(e):e instanceof Error?e.message:'生成失败');}
      }
    }
    if(!results.length)throw new LearningError('没有题目通过生成与质量校验：'+failures.join('；').slice(0,300),502);
    return results;
}

async function createLearningSet(userId: string, request: LearningRequest, dateKey: string | null, selectionKey: string, progress?: (stage:string)=>void) {
    const questions = await generateExercises(userId, request, progress);
    progress?.('保存练习');
    const title = request.mode === 'daily' ? '今日专属练习' : request.paperId ? `${request.subject} · 试卷出题（${request.paperSets || 1} 套）` : request.paperSets ? `${request.subject} · AI 组卷（${request.paperSets} 套）` : request.source==='history'?'历史练习 · 随机变式':request.unitId || request.unitIds?.length ? `${request.subject} · 章节${request.unitMode === 'review' ? '复习' : '练习'}`:`${request.subject} · AI练习`;
    const data = { userId, dateKey, selectionKey, source: request.source, title, questions: JSON.stringify(questions), parameters: JSON.stringify(request) };
    if (dateKey) {
        return prisma.learningSet.upsert({ where: { userId_dateKey_selectionKey: { userId, dateKey, selectionKey } }, create: data, update: {}, include: { records: true } });
    }
    return prisma.learningSet.create({ data, include: { records: true } });
}

export async function getOrCreateLearningSet(userId: string, request: LearningRequest, progress?: (stage:string)=>void) {
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { currentGrade: true, educationStage: true, enrollmentYear: true, studyPreferences:true } });
    const studentGrade = currentStudentGrade(student || {});
    request = { ...request, grade: request.mode === 'daily' ? (studentGrade ? STUDENT_GRADES[studentGrade] : '') : request.grade || (studentGrade ? STUDENT_GRADES[studentGrade] : '') };
    if (request.paperId && (request.mode !== 'ai' || request.source !== 'ai' || request.unitId || request.unitIds?.length)) throw new LearningError('试卷出题请选择单独一份试卷', 400);
    if (request.paperSets && !request.paperId) {
        if (request.mode !== 'ai' || request.source !== 'ai' || !request.subject || !request.grade) throw new LearningError('AI 组卷请先选择科目和年级', 400);
        const preferences = studyPreferences(student?.studyPreferences);
        const selectedPublisher = request.publisher || preferences.activePublisher;
        const currentCourse = preferences.studyCourses.filter(course => course.subject === request.subject && course.grade === request.grade && (!preferences.activeRegion || course.region === preferences.activeRegion) && (!selectedPublisher || course.publisher === selectedPublisher) && (!request.volume || course.volume === request.volume)).at(-1);
        const units = preferences.studyUnits.filter(unit => unit.entries.length > 0 && unit.subject === request.subject && unit.grade === request.grade && (!preferences.activeRegion || unit.region === preferences.activeRegion) && (!selectedPublisher || unit.publisher === selectedPublisher) && (!request.volume || unit.volume === request.volume) && (!currentCourse || unit.schoolSystem === currentCourse.schoolSystem && unit.textbook === currentCourse.textbook && unit.edition === currentCourse.edition && unit.isbn.replace(/[^0-9X]/gi, '') === currentCourse.isbn.replace(/[^0-9X]/gi, '')));
        if (request.unitIds?.some(id => !units.some(unit => unit.id === id))) throw new LearningError('所选章节缺少已核对知识点，或不属于当前教材版本与册别，请重新选择。', 422);
        if (!request.unitIds?.length && !units.length) throw new LearningError('当前筛选条件下没有已核对的知识点，请到科目设置补充对应册别的单元内容，或调整上方筛选。', 422);
        request = { ...request, unitIds: request.unitIds?.length ? request.unitIds : shuffleQuestions(units).slice(0, 30).map(unit => unit.id), prompt: `根据当前筛选教材的已核对知识点，随机设计${request.paperSets}套练习试卷，每套6题。题目包含基础理解、应用和综合，分布在不同知识点；每题独立完整，有明确答案和解析。只能围绕已选或已核对单元出题，不能编造教材原文。` };
    }
    if (request.unitIds?.length) {
        if (request.mode !== 'ai' || request.source !== 'ai' || request.paperId) throw new LearningError('章节出题仅支持 AI 练习模式', 400);
        const uniqueIds = [...new Set(request.unitIds)];
        const units = studyPreferences(student?.studyPreferences).studyUnits.filter(unit => uniqueIds.includes(unit.id));
        if (units.length !== uniqueIds.length || units.some(unit => unit.subject !== request.subject || unit.grade !== request.grade || (request.publisher && unit.publisher !== request.publisher) || (request.volume && unit.volume !== request.volume))) throw new LearningError('所选章节不属于当前教材和册别，请刷新目录后重试', 422);
        if (units.some(unit => !unit.entries.length)) throw new LearningError('所选章节中有尚未核对学习内容的章节，请补充知识点或取消选择', 422);
        request = { ...request, unitId: undefined, unitIds: uniqueIds, knowledgePoint: units.map(unit => unit.title).join('、').slice(0, 300), prompt: `${request.prompt ? request.prompt + ' ' : ''}只围绕所选教材章节出题：${units.map(unit => `${unit.volume} ${unit.title}`).join('、')}。出版社：${request.publisher || units[0].publisher}。每题轮换章节，使用该章节已录入知识点，题干和答案必须完整，不得编造未提供的课文原文。` };
    }
    if (request.unitId) {
        if (request.mode !== 'ai' || request.source !== 'ai') throw new LearningError('单元练习仅支持 AI 练习模式', 400);
        const unit = studyPreferences(student?.studyPreferences).studyUnits.find(item => item.id === request.unitId);
        if (!unit || unit.subject !== request.subject || unit.grade !== request.grade || (request.publisher && unit.publisher !== request.publisher) || (request.volume && unit.volume !== request.volume)) throw new LearningError('当前教材册别下没有这个章节，请刷新目录后重试', 404);
        if (!unit.entries.length) throw new LearningError('这个单元尚未录入教材中的学习内容，请先核对并补充知识点后再出题', 422);
        const entries = request.unitMode === 'review' && unit.entries.some(entry => !entry.mastered) ? unit.entries.filter(entry => !entry.mastered) : unit.entries;
        const selected = shuffleQuestions(entries).slice(0, Math.max(5, Math.min(20, request.count * 4)));
        request = { ...request, knowledgePoint: unit.title, prompt: `只围绕当前教材单元内容出题。地区：${unit.region || '未指定'}；出版社：${unit.publisher || '未指定'}；教材版本：${unit.textbook || '未指定'}；学制：${unit.schoolSystem || '未指定'}；版次：${unit.edition || '未指定'}；册别：${unit.volume || '未指定'}；单元：${unit.title}；模式：${request.unitMode === 'review' ? '优先复习尚未掌握的内容；如全部已掌握则复习全单元' : '学习并巩固单元内容'}。本单元目录课目：${unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `（第${lesson.page}页）` : ''}`).join('、').slice(0, 700)}。已录入的学习内容：${selected.map(entry => `${entry.kind}${entry.term}：${entry.meaning}`).join('；').slice(0, 1400)}。目录只提供标题和页码，不代表已获取课文原文；不得编造课文细节。${unit.subject === '英语' ? '英语可采用词义选择、语境运用、拼写辨析等题型，不要要求未提供的音频。' : '题目限定在上述主题和年级通用知识范围，给出完整条件与解析。'}` };
    } else if (request.mode === 'ai' && request.source === 'ai' && !request.paperId && ((!request.knowledgePoint?.trim() && !request.prompt?.trim()) || !!request.volume)) {
        const preferences = studyPreferences(student?.studyPreferences);
        const selectedPublisher = request.publisher || preferences.activePublisher;
        const currentCourse = preferences.studyCourses.filter(course => course.subject === request.subject && course.grade === request.grade && (!preferences.activeRegion || course.region === preferences.activeRegion) && (!selectedPublisher || course.publisher === selectedPublisher)).at(-1);
        const units = preferences.studyUnits.filter(unit => unit.entries.length > 0 && unit.subject === request.subject && unit.grade === request.grade && (!preferences.activeRegion || unit.region === preferences.activeRegion) && (!selectedPublisher || unit.publisher === selectedPublisher) && (!request.volume || unit.volume === request.volume) && (!currentCourse || (unit.schoolSystem === currentCourse.schoolSystem && unit.textbook === currentCourse.textbook && unit.edition === currentCourse.edition)));
        if (units.length) {
            const unit = units[Math.floor(Math.random() * units.length)];
            const entries = shuffleQuestions(unit.entries).slice(0, Math.max(3, Math.min(12, request.count * 3)));
            request = { ...request, unitId: unit.id, unitMode: 'practice', knowledgePoint: unit.title, prompt: `从已录入的「${unit.title}」单元随机选取知识点出题。地区：${unit.region || '未指定'}；出版社：${unit.publisher || '未指定'}；教材版本：${unit.textbook || '未指定'}；目录课目：${unit.lessons.map(lesson => lesson.title).join('、').slice(0, 600)}；学习内容：${entries.map(entry => `${entry.term}：${entry.meaning}`).join('；').slice(0, 1200)}。${request.knowledgePoint ? `额外关注：${request.knowledgePoint}。` : ''}${request.prompt ? `学习要求：${request.prompt}。` : ''}目录只提供标题，不得编造课文原文。题目须符合${request.grade}，条件完整，答案准确。` };
        }
        else if (selectedPublisher && !request.paperSets) request = { ...request, prompt: `${request.prompt ? request.prompt + '。' : ''}当前筛选教材没有已核对的知识点；仅按${request.grade}${request.subject}通用课程知识随机出题，不得声称题目来自该教材的目录或课文。` };
    }
    const dateKey = request.mode === 'daily' ? learningDateKey() : null;
    const selectionKey = createHash('sha256').update(JSON.stringify({...request,curriculum:student?.studyPreferences||'{}',...(request.mode==='daily'?{dailyGeneratorVersion:2}:{})})).digest('hex');
    if (!dateKey) return createLearningSet(userId, request, null, selectionKey, progress);
    const existing = await prisma.learningSet.findUnique({ where: { userId_dateKey_selectionKey: { userId, dateKey, selectionKey } }, include: { records: true } });
    if (existing) {if(existing.archivedAt)throw new LearningError('今天这组练习已在回收站，请从知识库恢复或调整练习选项。',409);return existing;}
    const key = `${userId}:${dateKey}:${selectionKey}`;
    const pending = pendingDailySets.get(key);
    if (pending) return pending;
    const promise = createLearningSet(userId, request, dateKey, selectionKey, progress);
    pendingDailySets.set(key, promise);
    try { return await promise; }
    finally { pendingDailySets.delete(key); }
}

export function learningSetForClient(set: { createdAt?: Date; favorited?: boolean; favoriteIndices?: string; deletedIndices?: string; id: string; dateKey: string | null; title: string; source: string; questions: string; parameters: string; records: { exerciseIndex: number | null; userAnswer: string | null; isCorrect: boolean | null }[] }) {
    const questions = JSON.parse(set.questions) as LearningExercise[];
    return {
        createdAt: set.createdAt?.toISOString(), favorited: set.favorited || false, id: set.id, dateKey: set.dateKey, title: set.title, source: set.source,
        parameters: JSON.parse(set.parameters),
        questions: questions.map((exercise, index) => {
            const record = set.records.find(record => record.exerciseIndex === index);
            const { answerText, analysis } = exercise;
            const question = { ...exercise };
            delete question.correctOption;
            delete question.answerText;
            delete question.answerHtml;
            delete question.analysis;
            return { ...question, favorited: (JSON.parse(set.favoriteIndices || '[]') as number[]).includes(index), deleted: (JSON.parse(set.deletedIndices || '[]') as number[]).includes(index), ...(record ? { answerText, analysis, answerHtml: exercise.answerHtml, record: { userAnswer: record.userAnswer || '', isCorrect: record.isCorrect } } : {}) };
        }),
    };
}
