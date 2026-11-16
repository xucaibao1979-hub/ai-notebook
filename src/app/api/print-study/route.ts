import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { LearningExercise } from '@/lib/learning';
import { hasPrintedChoiceOptions } from '@/lib/print-preview';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

    const q = new URL(req.url).searchParams;
    const mode = q.get('mode') === 'sets' ? 'sets' : 'errors';
    const limit = mode === 'sets' ? 100 : 500;
    const ids = q.has('ids') ? [...new Set((q.get('ids') ?? '').split(',').map(id => id.trim()))] : null;
    if (ids && (ids.length > limit || ids.some(id => !id))) {
        return NextResponse.json({ message: `请选择 1 至 ${limit} 个有效 ID` }, { status: 400 });
    }

    if (mode === 'errors') {
        const rows = await prisma.errorItem.findMany({
            where: {
                userId: session.user.id,
                archivedAt: q.get('trash') === '1' ? { not: null } : null,
                ...(!ids && q.get('subjectId') ? { subjectId: q.get('subjectId')! } : {}),
                ...(!ids && q.get('query') ? { OR: [
                    { questionText: { contains: q.get('query')! } },
                    { analysis: { contains: q.get('query')! } },
                    { userNotes: { contains: q.get('query')! } },
                    { tags: { some: { name: { contains: q.get('query')! } } } },
                ] } : {}),
                ...(!ids && q.get('mastery') ? { masteryLevel: q.get('mastery') === '1' ? { gt: 0 } : 0 } : {}),
                ...(!ids && q.get('timeRange') && q.get('timeRange') !== 'all' ? { createdAt: { gte: new Date(Date.now() - (q.get('timeRange') === 'week' ? 7 : 30) * 86400000) } } : {}),
                ...(!ids && q.get('tag') ? { tags: { some: { name: q.get('tag')! } } } : {}),
                ...(!ids && q.get('gradeSemester') ? { gradeSemester: { contains: q.get('gradeSemester')! } } : {}),
                ...(!ids && q.get('paperLevel') ? { paperLevel: q.get('paperLevel')! } : {}),
                ...(!ids && q.get('favorites') === '1' ? { favorited: true } : {}),
                ...(ids ? { id: { in: ids } } : {}),
            },
            include: { subject: true, tags: true },
            orderBy: { createdAt: q.get('sort') === 'time_asc' ? 'asc' : 'desc' },
            take: 500,
        });
        return NextResponse.json(rows.map(row => ({
            key: row.id, title: row.subject?.name || '错题', questionText: row.questionText || '',
            isChoiceQuestion: hasPrintedChoiceOptions(row.questionText || ''),
            image: row.originalImageUrl, answerText: row.answerText || '', analysis: row.analysis || '',
            tags: row.tags.map(tag => tag.name),
        })));
    }

    const rows = await prisma.learningSet.findMany({
        where: {
            userId: session.user.id, archivedAt: null,
            ...(q.get('setId') ? { id: q.get('setId')! } : {}),
            ...(ids ? { id: { in: ids } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    return NextResponse.json(rows.flatMap(row => {
        const hidden = new Set<number>(JSON.parse(row.deletedIndices));
        return (JSON.parse(row.questions) as LearningExercise[])
            .map((exercise, index) => ({ ...exercise, index }))
            .filter(exercise => !hidden.has(exercise.index))
            .map(exercise => ({
                key: row.id + ':' + exercise.index, title: row.title,
                questionText: exercise.questionText + (exercise.options ? '\n' + exercise.options.map((option, index) => String.fromCharCode(65 + index) + '. ' + option).join('\n') : ''),
                questionHtml: exercise.questionHtml, isChoiceQuestion: (Array.isArray(exercise.options) && exercise.options.length > 0) || hasPrintedChoiceOptions(exercise.questionText || '', exercise.questionHtml), answerText: exercise.answerText,
                answerHtml: exercise.answerHtml, analysis: exercise.analysis, tags: exercise.knowledgePoints,
            }));
    }));
}
