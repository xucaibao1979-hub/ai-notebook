import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { LibraryQuestion } from '@/lib/knowledge-library';
import { paperQuality } from '@/lib/paper-quality';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const { id } = await params;
    const paper = await prisma.knowledgePaper.findUnique({ where: { id } });
    if (!paper) return NextResponse.json({ message: '试卷不存在' }, { status: 404 });
    const query = new URL(req.url).searchParams;
    const showAnswers = query.get('answers') === '1';
    const grade = query.get('grade');
    const alternatives=await prisma.knowledgePaper.findMany({where:{id:{not:id},year:paper.year,examType:paper.examType,subject:paper.subject,region:paper.region},select:{id:true,title:true,sourceName:true,status:true},orderBy:{status:'asc'},take:10});
    const rawQuestions=JSON.parse(paper.questions) as LibraryQuestion[];
    const imagePageCount=rawQuestions.reduce((n,q)=>n+(q.questionHtml.match(/<img\b/g)||[]).length,0);
    const answerPageCount=rawQuestions.reduce((n,q)=>n+(q.answerHtml.match(/<img\b/g)||[]).length,0);
    const questions = rawQuestions.filter(question =>
        question.wholePaper || !grade || grade === 'all' || (grade === 'unknown' ? question.grade === null : question.grade === Number(grade)));
    const attachments = JSON.parse(paper.attachments) as { label: string; url: string; kind: string }[];
    return NextResponse.json({ ...paper,alternatives,imagePageCount,answerPageCount, quality: paperQuality(JSON.parse(paper.questions)), knowledgeGrades: JSON.parse(paper.knowledgeGrades), attachments: attachments.filter(item => showAnswers || item.kind !== 'answer'), questions: questions.map(question => ({ ...question, answerHtml: showAnswers ? question.answerHtml : '', correctedAnswerMarkdown:showAnswers?question.correctedAnswerMarkdown:undefined, hasAnswer: !!(question.answerHtml||question.correctedAnswerMarkdown) })) });
}
