import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const subjects = new Set(['语文', '数学', '英语']);

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const subject = new URL(req.url).searchParams.get('subject') || '';
    if (!subjects.has(subject)) return NextResponse.json({ message: '请选择有效科目' }, { status: 400 });
    try {
        const result = await prisma.knowledgePaper.aggregate({
            where: { subject, questionCount: { gt: 0 } },
            _count: { id: true },
            _sum: { questionCount: true },
        });
        return NextResponse.json({ subject, papers: result._count.id, questions: result._sum.questionCount || 0 });
    } catch {
        return NextResponse.json({ message: '题库数量读取失败' }, { status: 500 });
    }
}
