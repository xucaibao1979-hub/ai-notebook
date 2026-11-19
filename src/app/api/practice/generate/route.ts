import {prepareErrorSolution} from '@/lib/error-solution';
import { validateExercise } from '@/lib/exercise-validation';
import { curriculumBrief } from '@/lib/study-preferences';
import { currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { getAIService } from "@/lib/ai";
import { notFound, internalError, unauthorized } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { questionKey, usedQuestionKeys } from '@/lib/public-question-bank';

const logger = createLogger('api:practice:generate');

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
        return unauthorized("Authentication required");
    }

    try {
        const { errorItemId, language, difficulty } = await req.json();

        const errorItemWithSubject = await prisma.errorItem.findFirst({
            where: { id: errorItemId, userId: session.user.id },
            include: { subject: true }
        });

        if (!errorItemWithSubject) {
            return notFound("Item not found");
        }

        let tags: string[] = [];
        try {
            tags = JSON.parse(errorItemWithSubject.knowledgePoints || "[]");
        } catch {
            tags = [];
        }

        const profile=await prisma.user.findUnique({where:{id:session.user.id},select:{currentGrade:true,educationStage:true,enrollmentYear:true,studyPreferences:true}});
        const currentGrade=currentStudentGrade(profile||{});
        const grade=currentGrade?STUDENT_GRADES[currentGrade]:errorItemWithSubject.gradeSemester;
        const solution=await prepareErrorSolution(session.user.id,errorItemId);
        const aiService = getAIService('generate',session.user.id);
        const used = await usedQuestionKeys(session.user.id);
        let similarQuestion: Awaited<ReturnType<typeof aiService.generateSimilarQuestion>> | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
            const candidate = await aiService.generateSimilarQuestion(
                (errorItemWithSubject.questionText || "")+'\n已核对的正确答案：'+solution.answerText+'\n原题解题思路：'+solution.analysis+'\n'+curriculumBrief(profile?.studyPreferences,errorItemWithSubject.subject?.name)+(attempt?'\n请换一个题型和情境，避免重复历史题目。':''),
                tags, language, difficulty || 'medium', grade
            );
            if (candidate.questionText?.trim() && !used.has(questionKey(candidate.questionText))) { similarQuestion = candidate; break; }
        }
        if (!similarQuestion) return NextResponse.json({ message: '多次生成仍与历史内容重复，请调整条件后重试' }, { status: 409 });

        // Inject the subject from the database with type safety
        const validSubjects = ["数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"] as const;
        const subjectName = errorItemWithSubject.subject?.name || "其他";
        similarQuestion.subject = validSubjects.some(subject => subject === subjectName) ? subjectName as typeof validSubjects[number] : "其他";

        const validation=await validateExercise({...similarQuestion,subject:similarQuestion.subject||'其他',difficulty:difficulty||'medium',knowledgePoints:similarQuestion.knowledgePoints||[],provenance:{name:'AI变式'}},grade||'当前年级',curriculumBrief(profile?.studyPreferences),session.user.id);
        const saved = await prisma.learningSet.create({data:{
            userId:session.user.id,selectionKey:crypto.randomUUID(),source:'notebook',title:subjectName+' · 举一反三',
            questions:JSON.stringify([{...similarQuestion,validation,knowledgePoints:similarQuestion.knowledgePoints || tags,difficulty:difficulty || 'medium',provenance:{name:'错题 AI 举一反三',originalId:errorItemId,url:'/error-items/'+errorItemId,grade:grade || undefined}}]),
            parameters:JSON.stringify({mode:'ai',source:'ai',subject:similarQuestion.subject,prompt:'',knowledgePoint:tags.join('、'),grade:errorItemWithSubject.gradeSemester || '',difficulty:difficulty || 'medium',count:1})
        }});
        return NextResponse.json({...similarQuestion,learningSetId:saved.id,createdAt:saved.createdAt});
    } catch (error) {
        logger.error({ error }, 'Error generating practice');
        const errorMessage = error instanceof Error ? error.message : "Failed to generate practice question";
        return internalError(errorMessage);
    }
}
