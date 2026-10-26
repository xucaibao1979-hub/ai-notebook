import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { STUDENT_GRADES } from '@/lib/student-grade';
import { usableForRecommendation } from '@/lib/paper-quality';
import type { LibraryQuestion } from '@/lib/knowledge-library';

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const subject = (params.get('subject') || '').slice(0, 50);
    const grade = Number(Object.entries(STUDENT_GRADES).find(([, label]) => label === params.get('grade'))?.[0] || 0);
    if (!subject || grade < 7 || grade > 12) return NextResponse.json({ papers: [] });
    const rows = await prisma.knowledgePaper.findMany({ where: { subject, questionCount: { gt: 0 } }, select: { id: true, title: true, year: true, region: true, questions: true }, orderBy: [{ year: 'desc' }, { title: 'asc' }], take: 200 });
    const papers = rows.flatMap(paper => {
        try {
            const count = (JSON.parse(paper.questions) as LibraryQuestion[]).filter(question => question.grade !== null && question.grade <= grade && usableForRecommendation(question)).length;
            return count ? [{ id: paper.id, title: paper.title, year: paper.year, region: paper.region, questionCount: count }] : [];
        } catch { return []; }
    });
    return NextResponse.json({ papers });
}
