import { validateExercise } from './exercise-validation';
import {createHash} from 'crypto';
import { curriculumBrief, curriculumSubject } from './study-preferences';
import { prisma } from './prisma';
import { getAIService } from './ai';
import { calculateWeakPoints, weeklyWindow, WeeklyItem, WeeklyStatistics } from './weekly-analysis';
import { LEARNING_SUBJECTS, LearningExercise, shuffleQuestions } from './learning';
import { getAppConfig, getActiveOpenAIConfig } from './config';
import { currentStudentGrade, STUDENT_GRADES } from './student-grade';

export function weeklyAIConfigured() {
    const config = getAppConfig();
    return config.aiProvider === 'openai' ? !!getActiveOpenAIConfig()?.apiKey : config.aiProvider === 'azure' ? !!(config.azure?.apiKey && config.azure.endpoint && config.azure.deploymentName) : !!config.gemini?.apiKey;
}

export async function analyzeWeek(userId: string, notebookId?: string, force = false, deferAI = false) {
    if (notebookId && !(await prisma.subject.findFirst({ where: { id: notebookId, userId } }))) throw new Error('错题本不存在或无权访问');
    const now = new Date();
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { currentGrade: true, educationStage: true, enrollmentYear: true,studyPreferences:true } });
    const studentGrade = currentStudentGrade(student || {});
    const studentLabel = studentGrade ? STUDENT_GRADES[studentGrade] : '';
    const window = weeklyWindow(now);
    const where = { userId_notebookKey_weekKey: { userId, notebookKey: notebookId || 'all', weekKey: window.weekKey } };
    let report = await prisma.weeklyReport.findUnique({ where });
    const curriculumKey=student?.studyPreferences&&student.studyPreferences!=='{}'?createHash('sha256').update(student.studyPreferences).digest('hex'):null;
    const curriculumChanged=report&&curriculumKey!==null&&JSON.parse(report.statistics||'{}').curriculumKey!==curriculumKey;
    const gradeChanged = report ? JSON.parse(report.statistics || '{}').grade !== studentGrade : false;
    if (report?.leaseUntil && report.leaseUntil > now) return report;
    if (!force && !gradeChanged && !curriculumChanged && report && ['ready', 'empty'].includes(report.status)) return report;
    if (!force && !gradeChanged && report?.retryAfter && report.retryAfter > now && !weeklyAIConfigured()) return report;
    if (!force && !gradeChanged && report?.status === 'failed' && report.retryAfter && report.retryAfter > now) return report;

    const items = await prisma.errorItem.findMany({ where: { userId, archivedAt:null, ...(notebookId ? { subjectId: notebookId } : {}), createdAt: { gte: window.periodStart, lt: window.periodEnd } }, include: { subject: { select: { name: true } }, tags: { select: { name: true } } } });
    const statistics = calculateWeakPoints(items);
    statistics.curriculumKey = curriculumKey;
    statistics.grade = studentGrade;
    statistics.gradeLabel = studentLabel;
    const leaseUntil = new Date(now.getTime() + 15 * 60000);
    if (!report) {
        report = await prisma.weeklyReport.upsert({ where, create: { userId, notebookId, notebookKey: notebookId || 'all', ...window, statistics: JSON.stringify(statistics) }, update: {} });
    }
    const claim = await prisma.weeklyReport.updateMany({ where: { id: report.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { status: 'analyzing', leaseUntil, statistics:JSON.stringify(statistics),message:'已完成错题统计，正在生成薄弱点建议和专项练习…' } });
    if (!claim.count) return prisma.weeklyReport.findUniqueOrThrow({ where: { id: report.id } });
    const base = { ...window, statistics: JSON.stringify(statistics), leaseUntil: null, exerciseSetId: null, summary: '', retryAfter: null };
    if (!items.length) return prisma.weeklyReport.update({ where: { id: report.id }, data: { ...base, status: 'empty', message: '最近七天没有新增错题，本次无需生成专项练习。' } });
    if (!weeklyAIConfigured()) return prisma.weeklyReport.update({ where: { id: report.id }, data: { ...base, status: 'awaiting_ai', message: '已完成错题统计与薄弱点排序，请配置 AI 服务以生成详细分析和专项练习。', retryAfter: new Date(now.getTime() + 6 * 3600000) } });
    const finish=async()=>{try {
        const ai = getAIService('weekly', userId);
        const brief = shuffleQuestions(items).slice(0, 12).map(item => ({ subject: item.subject?.name, question: item.questionText?.slice(0, 300), masteryLevel: item.masteryLevel, mistake: item.mistakeAnalysis?.slice(0, 150), tags: item.tags.map(tag => tag.name) }));
        const evidence = { ...statistics, weakPoints: statistics.weakPoints.map(point => ({ name: point.name, subject: point.subject, count: point.count, unmastered: point.unmastered, score: point.score })) };
        const [diagnosis,questions] = await Promise.all([
          ai.reanswerQuestion(`这是学习诊断任务。请分析学生最近七天的错题记录，给出薄弱知识点、可能的错误原因和一周复习建议。统计覆盖全部记录，详细样本最多12道。只根据已有证据，不将频次排名当成确定的认知诊断。各科教材与章节要求：${statistics.weakPoints.slice(0,3).map(point=>curriculumBrief(student?.studyPreferences,point.subject)).join('\n')}。不要逐题重新解答。返回 answer_text 为简短总结，analysis 为完整 Markdown 周报，knowledge_points 为最多五个重点。\n统计：${JSON.stringify(evidence)}\n错题样本：${JSON.stringify(brief)}`, 'zh'),
          generateWeeklyQuestions(getAIService('generate',userId), statistics, items, studentLabel, userId, student?.studyPreferences||'{}')
        ]);
        return await prisma.$transaction(async tx => {
            const owned = await tx.weeklyReport.findFirst({ where: { id: report.id, leaseUntil } });
            if (!owned) return tx.weeklyReport.findUniqueOrThrow({ where: { id: report.id } });
            const set = await tx.learningSet.create({ data: { userId, dateKey: null, selectionKey: `weekly:${report.id}:${now.toISOString()}`, source: 'weekly', title: '每周薄弱点 · 专项变式练习', questions: JSON.stringify(questions), parameters: JSON.stringify({ mode: 'ai', source: 'ai', subject: questions[0]?.subject || '其他', count: questions.length, prompt: '每周薄弱点专项练习', knowledgePoint: statistics.weakPoints.slice(0, 3).map(point => point.name).join('、'), grade: studentLabel, difficulty: 'medium' }) } });
            return tx.weeklyReport.update({ where: { id: report.id }, data: { ...base, summary: `${diagnosis.answerText}\n\n${diagnosis.analysis}`, exerciseSetId: set.id, status: 'ready', message: '已完成最近七天错题分析和专项练习生成。' } });
        });
    } catch (error) {
        console.error('[weekly] AI generation failed', error instanceof Error ? error.message : 'Unknown error');
        await prisma.weeklyReport.updateMany({ where: { id: report.id, leaseUntil }, data: { ...base, status: 'failed', message: 'AI 分析或出题失败，统计结果已保留。请检查模型配置后重试。', retryAfter: new Date(now.getTime() + 6 * 3600000) } });
        return prisma.weeklyReport.findUniqueOrThrow({ where: { id: report.id } });
    }};
    if(deferAI){void finish();return prisma.weeklyReport.findUniqueOrThrow({where:{id:report.id}});}
    return finish();
}

async function generateWeeklyQuestions(ai: ReturnType<typeof getAIService>, statistics: WeeklyStatistics, items: WeeklyItem[], grade: string,userId:string,curriculum:string) {
    const targets = statistics.weakPoints.filter(point => point.unmastered > 0).slice(0, 3);
    const selected = targets.length ? targets : statistics.weakPoints.slice(0, 3);
    const results=await Promise.allSettled(selected.map(async (point, index) => {
        const subjectCurriculum=curriculumBrief(curriculum,point.subject);
        const original = shuffleQuestions(items.filter(item => point.errorIds.includes(item.id) && item.questionText?.trim()))[0];
        const subject = LEARNING_SUBJECTS.find(name => point.subject.includes(name)) || curriculumSubject(point.subject)||'其他';
        const variation = ['改变数据与条件', '换成生活应用情境', '强化概念辨析'][index];
        const question = await ai.generateSimilarQuestion(`学科：${point.subject}。当前年级：${grade || '参考原题年级'}。针对薄弱知识点「${point.name}」举一反三，${variation}，不要重复原题。新题必须文字自包含，无需外部图片。${subjectCurriculum}\n参考错题知识点：${point.name}。参考题型：${original?.questionText?.slice(0,250)||'无原题'}。请独立创作并给出准确答案、解析。`, [point.name], 'zh', 'medium', grade || original?.gradeSemester);
        if (!question.questionText?.trim() || !question.answerText?.trim() || !question.analysis?.trim() || question.questionText.trim() === original?.questionText?.trim()) throw new Error('AI 未返回有效的新变式题');
        const exercise:LearningExercise={ questionText: question.questionText, answerText: question.answerText, analysis: question.analysis, subject, knowledgePoints: [point.name], difficulty: 'medium', provenance: { name: `每周专项 · ${point.subject} · ${point.name}`, grade: grade || original?.gradeSemester || undefined, ...(original ? { url: `/error-items/${original.id}`, originalId: original.id } : {}) } };
        exercise.validation=await validateExercise(exercise,grade,subjectCurriculum,userId);return exercise;
    }));
    const questions=results.filter((r):r is PromiseFulfilledResult<LearningExercise>=>r.status==='fulfilled').map(r=>r.value);
    if(!questions.length)throw new Error('专项题目未通过复核');
    return questions;
}

export async function runWeeklySweep() {
    const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
    for (const user of users) {
        const notebooks = await prisma.subject.findMany({ where: { userId: user.id }, select: { id: true } });
        // One analysis per notebook avoids generating the same material again in a separate all-notebook report.
        for (const notebook of notebooks) {
            try { await analyzeWeek(user.id, notebook.id); }
            catch (error) { console.error('[weekly-scheduler] Notebook analysis failed', error instanceof Error ? error.message : 'Unknown error'); }
        }
    }
}
