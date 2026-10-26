import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatedKnowledgePoints } from '@/lib/generated-knowledge-points';

export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const [sets, cards] = await Promise.all([
        prisma.learningSet.findMany({ where: { userId: session.user.id, archivedAt: null }, orderBy: { createdAt: 'desc' }, select: { id: true, questions: true, parameters: true, deletedIndices: true, createdAt: true } }),
        prisma.knowledgeCard.findMany({ where: { userId: session.user.id }, select: { subject: true, title: true } }),
    ]);
    return NextResponse.json(generatedKnowledgePoints(sets, cards));
}
