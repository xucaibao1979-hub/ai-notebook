import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { catalogSubjectNodes } from '@/lib/study-catalog';
import { studyPreferences } from '@/lib/study-preferences';
import { STUDENT_GRADES } from '@/lib/student-grade';
import { matchingVerifiedTextbook, verifiedCatalogFor } from '@/lib/verified-textbook-catalog';

const input = z.object({ region: z.string().trim().min(1).max(80), publisher: z.string().trim().min(1).max(100), subject: z.string().trim().min(1).max(50), grade: z.string().trim().min(1).max(80), schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''), textbook: z.string().trim().max(100).default(''), edition: z.string().trim().max(80).default(''), isbn: z.string().trim().max(32).default(''), volume: z.enum(['上册', '下册']) });

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !Object.values(STUDENT_GRADES).includes(parsed.data.grade)) return NextResponse.json({ message: '请选择有效的地区、出版社、科目和年级' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { studyPreferences: true } });
    if (!user) return NextResponse.json({ message: '用户不存在' }, { status: 404 });
    const preferences = studyPreferences(user.studyPreferences);
    const scope = parsed.data;
    if (!catalogSubjectNodes(preferences).some(node => node.region === scope.region && node.publisher === scope.publisher && node.name === scope.subject)) return NextResponse.json({ message: '该地区下没有对应的出版社或科目' }, { status: 404 });
    const matchedBook = matchingVerifiedTextbook(scope);
    const resolvedScope = matchedBook ? { ...scope, ...matchedBook } : scope;
    const verified = verifiedCatalogFor(resolvedScope);
    if (verified) return NextResponse.json({ ...verified, volume: scope.volume, scope: resolvedScope, verification: 'user-photo', source: '用户提供的 2026 年 7 月第 1 版五年级上册目录照片' });
    return NextResponse.json({ message: `未找到可核对的${scope.volume}原版目录。请上传本册目录页或手动录入；仅凭书名或另一册不能生成与书本一致的内容。` }, { status: 422 });
}
