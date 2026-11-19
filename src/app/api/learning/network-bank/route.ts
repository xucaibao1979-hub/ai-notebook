import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { LibraryQuestion } from '@/lib/knowledge-library';
import { shuffleQuestions } from '@/lib/learning';
import { rotateQuestionTypes } from '@/lib/public-question-bank';

const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];

function questionType(question: LibraryQuestion): string {
    const text = question.correctedMarkdown || question.questionHtml.replace(/<[^>]*>/g, ' ');
    if (/[A-DＡ-Ｄ]\s*[.．、)）]/.test(text) || /选择题|单选题|多选题/.test(text)) return '选择题';
    if (/填空题|填入|填写|____|_{2,}|（\s*）/.test(text)) return '填空题';
    if (/阅读|阅读理解|材料/.test(text)) return '阅读理解';
    if (/计算|求解|解方程|列式/.test(text)) return '计算题';
    return '解答题/其他';
}

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const papers = await prisma.knowledgePaper.findMany({
            where: { subject: { in: subjects }, questionCount: { gt: 0 } },
            select: { id: true, title: true, subject: true, year: true, examGrade: true, sourceName: true, sourceUrl: true, fetchedAt: true, questions: true },
            orderBy: { fetchedAt: 'desc' }, take: 100,
        });
        const items = shuffleQuestions(papers).map(paper => {
            let questions: LibraryQuestion[] = [];
            try { const parsed: unknown = JSON.parse(paper.questions); if (Array.isArray(parsed)) questions = parsed; } catch { /* Skip malformed entries. */ }
            const points = [...new Set(questions.flatMap(question => Array.isArray(question.knowledgePoints) ? question.knowledgePoints.filter((point): point is string => typeof point === 'string' && !!point.trim()) : []))];
            const types = [...new Set(rotateQuestionTypes(questions, questionType).map(questionType))];
            return { id: paper.id, title: paper.title, subject: paper.subject, year: paper.year, examGrade: paper.examGrade, sourceName: paper.sourceName, sourceUrl: paper.sourceUrl, fetchedAt: paper.fetchedAt.toISOString(), questionCount: questions.length, types, knowledgePoints: points.slice(0, 30), moreKnowledgePoints: Math.max(0, points.length - 30) };
        }).filter(item => item.questionCount > 0);
        return NextResponse.json({ items });
    } catch { return NextResponse.json({ message: '网络题库读取失败，请稍后重试' }, { status: 500 }); }
}
