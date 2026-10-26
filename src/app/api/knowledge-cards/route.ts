import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const cardFields = z.object({
    title: z.string().trim().min(1).max(100),
    subject: z.string().trim().min(1).max(50),
    concept: z.string().trim().max(4000),
    pitfall: z.string().trim().max(4000),
    method: z.string().trim().max(4000),
    grade: z.string().trim().max(50).nullable().optional(),
    chapter: z.string().trim().max(100).nullable().optional(),
    status: z.enum(['reviewing', 'mastered']),
});
const createFields = cardFields.extend({ concept: cardFields.shape.concept.default(''), pitfall: cardFields.shape.pitfall.default(''), method: cardFields.shape.method.default(''), status: cardFields.shape.status.default('reviewing') });

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const params = new URL(req.url).searchParams;
    const errorItemId = params.get('errorItemId');
    const cards = await prisma.knowledgeCard.findMany({
        where: { userId: session.user.id, ...(errorItemId ? { errors: { some: { errorItemId } } } : {}) },
        include: { errors: { select: { errorItemId: true, errorItem: { select: { questionText: true, archivedAt: true } } } } },
        orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(cards.map(card => ({ ...card, errors: card.errors.filter(link => !link.errorItem.archivedAt) })));
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = createFields.extend({ errorItemId: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ message: '请填写知识点名称并检查内容长度' }, { status: 400 });
    const { errorItemId, ...data } = parsed.data;
    const error = await prisma.errorItem.findFirst({ where: { id: errorItemId, userId: session.user.id, archivedAt: null }, include: { subject: true } });
    if (!error) return NextResponse.json({ message: '错题不存在' }, { status: 404 });
    if (error.subject?.name && error.subject.name !== data.subject) return NextResponse.json({ message: '科目与错题不一致' }, { status: 400 });
    const card = await prisma.$transaction(async tx => {
        const saved = await tx.knowledgeCard.upsert({
            where: { userId_subject_title: { userId: session.user.id, subject: data.subject, title: data.title } },
            create: { ...data, userId: session.user.id },
            update: { concept: data.concept, pitfall: data.pitfall, method: data.method, grade: data.grade, chapter: data.chapter, status: data.status },
        });
        await tx.knowledgeCardError.upsert({ where: { cardId_errorItemId: { cardId: saved.id, errorItemId } }, create: { cardId: saved.id, errorItemId }, update: {} });
        return saved;
    });
    return NextResponse.json(card);
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = cardFields.partial().extend({ id: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ message: '知识卡内容无效' }, { status: 400 });
    const { id, ...data } = parsed.data;
    const result = await prisma.knowledgeCard.updateMany({ where: { id, userId: session.user.id }, data });
    if (!result.count) return NextResponse.json({ message: '知识卡不存在' }, { status: 404 });
    return NextResponse.json({ ok: true });
}
