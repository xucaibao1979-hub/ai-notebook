import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req?: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
    const items = await prisma.errorItem.findMany({
        where: { userId: session.user.id, archivedAt: null },
        select: { knowledgePoints: true, tags: { select: { name: true } } },
    });
    const counts = new Map<string, number>();
    for (const item of items) {
        let names = item.tags?.map(tag => tag.name) || [];
        if (!names.length && item.knowledgePoints) {
            try {
                const legacy: unknown = JSON.parse(item.knowledgePoints);
                if (Array.isArray(legacy)) names = legacy.filter((name): name is string => typeof name === 'string');
            } catch { /* Ignore malformed legacy tags. */ }
        }
        for (const name of new Set(names.map(name => name.trim()).filter(Boolean))) counts.set(name, (counts.get(name) || 0) + 1);
    }
    const stats = [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
    return NextResponse.json({ stats, total: items.length, uniqueTags: stats.length });
    } catch {
        return NextResponse.json({ message: '知识点统计加载失败' }, { status: 500 });
    }
}
