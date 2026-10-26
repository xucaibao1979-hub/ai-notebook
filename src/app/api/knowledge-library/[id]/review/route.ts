import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LibraryQuestion } from '@/lib/knowledge-library';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'admin') return NextResponse.json({ message: '本地校对需要管理员权限' }, { status: 403 });
    try {
        const { number, markdown, answerMarkdown, grade } = z.object({ number: z.string().min(1).max(40), markdown: z.string().trim().min(1).max(100000),answerMarkdown:z.string().trim().max(100000).optional(),grade:z.number().int().min(1).max(12).nullable().optional() }).parse(await req.json());
        const { id } = await params;
        const paper = await prisma.knowledgePaper.findUnique({ where: { id } });
        if (!paper) return NextResponse.json({ message: '试卷不存在' }, { status: 404 });
        const questions = JSON.parse(paper.questions) as LibraryQuestion[];
        const target = questions.find(question => question.number === number);
        if (!target) return NextResponse.json({ message: '题目不存在' }, { status: 404 });
        target.originalQuestionHtml ||= target.questionHtml;
        target.correctedMarkdown = markdown;
        if(answerMarkdown!==undefined)target.correctedAnswerMarkdown=answerMarkdown;
        if(grade!==undefined){target.grade=grade;target.gradeVerified=grade!==null;target.gradeBasis=grade?'管理员按教材和原题人工校对':'待确认';}
        target.locallyReviewed = true;
        target.answerLeakRisk = false;
        target.reviewedAt = new Date().toISOString(); target.reviewedBy = session.user.id;
        const updated = await prisma.knowledgePaper.updateMany({ where: { id, questions: paper.questions }, data: { questions: JSON.stringify(questions),answerCount:questions.filter(q=>q.answerHtml||q.correctedAnswerMarkdown).length,knowledgeGrades:JSON.stringify([...new Set(questions.map(q=>q.grade).filter(g=>g!==null))]) } });
        if (!updated.count) return NextResponse.json({ message: '试卷刚被更新，请刷新后重新校对' }, { status: 409 });
        return NextResponse.json({ message: '已保存本地校对版，原始题干和来源已保留。该操作不代表官方原卷认证。' });
    } catch (error) { return NextResponse.json({ message: error instanceof z.ZodError ? '请输入有效题干' : '保存校对内容失败，请重试' }, { status: error instanceof z.ZodError ? 400 : 500 }); }
}
