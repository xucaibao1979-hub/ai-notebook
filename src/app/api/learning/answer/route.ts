import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LearningExercise } from '@/lib/learning';
import { curriculumBrief } from '@/lib/study-preferences';
import { getAIService } from '@/lib/ai';

const schema = z.object({ setId: z.string().min(1), index: z.number().int().min(0).max(4), action: z.enum(['submit', 'reveal', 'assess', 'explain']), userAnswer: z.string().trim().max(5000).default(''), isCorrect: z.boolean().optional() });

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const body = schema.parse(await req.json());
        const set = await prisma.learningSet.findFirst({ where: { id: body.setId, userId: session.user.id, archivedAt:null } });
        if (!set) return NextResponse.json({ message: '练习不存在或无权访问' }, { status: 404 });
        const exercise = (JSON.parse(set.questions) as LearningExercise[])[body.index];
        if (!exercise || (JSON.parse(set.deletedIndices || '[]') as number[]).includes(body.index)) return NextResponse.json({ message: '题目不存在' }, { status: 404 });
        const result = { answerText: exercise.answerText, answerHtml: exercise.answerHtml, analysis: exercise.analysis };
        if (body.action === 'reveal') return NextResponse.json(result);
        if (body.action === 'explain') {
            const profile=await prisma.user.findUnique({where:{id:session.user.id},select:{studyPreferences:true}});
            const ai = getAIService('review',session.user.id);
            const questionText = `${curriculumBrief(profile?.studyPreferences,exercise.subject)}\n${exercise.questionText}\n${(exercise.options || []).map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}\n题库参考答案：${exercise.answerText}。请给出详细解析和易错点；如认为参考答案有误，请说明。`;
            const explanation = await ai.reanswerQuestion(questionText, 'zh', exercise.subject);
            return NextResponse.json({ ...result, analysis: explanation.analysis, aiExplanation: true });
        }
        if (!body.userAnswer) return NextResponse.json({ message: '请先填写答案' }, { status: 400 });
        if (exercise.correctOption && !/^[A-D]$/.test(body.userAnswer.toUpperCase())) {
            return NextResponse.json({ message: '请选择 A、B、C 或 D' }, { status: 400 });
        }
        if (body.action === 'assess' && (exercise.correctOption || typeof body.isCorrect !== 'boolean')) {
            return NextResponse.json({ message: '请选择掌握情况；选择题会按标准答案判分' }, { status: 400 });
        }
        const isCorrect = exercise.correctOption ? body.userAnswer.toUpperCase() === exercise.correctOption : body.action === 'assess' ? body.isCorrect! : null;
        if (body.action === 'assess') {
            const previous = await prisma.practiceRecord.findUnique({ where: { userId_learningSetId_exerciseIndex: { userId: session.user.id, learningSetId: set.id, exerciseIndex: body.index } } });
            if (!previous) return NextResponse.json({ message: '请先提交作答，再对照解析标记掌握情况' }, { status: 400 });
        }
        const data = { subject: exercise.subject, difficulty: exercise.difficulty, userAnswer: body.userAnswer, isCorrect };
        const record = await prisma.practiceRecord.upsert({
            where: { userId_learningSetId_exerciseIndex: { userId: session.user.id, learningSetId: set.id, exerciseIndex: body.index } },
            create: { userId: session.user.id, learningSetId: set.id, exerciseIndex: body.index, ...data }, update: data,
        });
        return NextResponse.json({ ...result, record: { userAnswer: record.userAnswer, isCorrect: record.isCorrect } });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
        const message = error instanceof Error && error.message.includes('AI_AUTH_ERROR') ? '请先在设置中配置 AI 服务，再获取详细解析。' : '处理失败，请重试';
        return NextResponse.json({ message }, { status: 502 });
    }
}
