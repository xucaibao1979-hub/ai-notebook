import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { weeklyWindow } from '@/lib/weekly-analysis';
import { analyzeWeek } from '@/lib/weekly-report-service';
import { z } from 'zod';

export const maxDuration = 300;
function serialize(report: { statistics: string; [key: string]: unknown }) { return { ...report, statistics: JSON.parse(report.statistics) }; }

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const notebookId = new URL(req.url).searchParams.get('notebookId');
    const reports = await prisma.weeklyReport.findMany({ where: { userId: session.user.id, weekKey: weeklyWindow().weekKey, ...(notebookId ? { notebookId } : { notebookId: { not: null } }) }, orderBy: { periodEnd: 'desc' }, include: { notebook: { select: { name: true } } } });
    return NextResponse.json({ reports: reports.map(serialize), schedule: '服务运行时每小时检查，本周首次执行分析最近七天；周一进入新一周后自动生成新报告。' });
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const body = z.object({ notebookId: z.string().max(100).optional() }).parse(await req.json());
        const notebooks = await prisma.subject.findMany({ where: { userId: session.user.id, ...(body.notebookId ? { id: body.notebookId } : {}) }, select: { id: true } });
        if (body.notebookId && !notebooks.length) return NextResponse.json({ message: '错题本不存在或无权访问' }, { status: 404 });
        const outcomes = await Promise.allSettled(notebooks.map(async notebook=>serialize(await analyzeWeek(session.user.id, notebook.id, true, true))));
        const reports=outcomes.flatMap(outcome=>outcome.status==='fulfilled'?[outcome.value]:[]);
        if(!reports.length&&notebooks.length)throw new Error('所有错题本分析均失败');
        return NextResponse.json({ reports, failedCount:outcomes.length-reports.length });
    } catch (error) {
        return NextResponse.json({ message: error instanceof z.ZodError ? '请求参数无效' : '分析暂时失败，请稍后重试' }, { status: error instanceof z.ZodError ? 400 : 500 });
    }
}
