import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { catalogCourses } from '@/lib/study-catalog';
import { studyPreferences } from '@/lib/study-preferences';
import { verifiedCatalogFor } from '@/lib/verified-textbook-catalog';

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = z.object({ courseId: z.string().min(1).max(100) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: '请选择教材目录' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { studyPreferences: true } });
    if (!user) return NextResponse.json({ message: '用户不存在' }, { status: 404 });
    const course = catalogCourses(studyPreferences(user.studyPreferences)).find(item => item.id === parsed.data.courseId);
    if (!course) return NextResponse.json({ message: '教材目录不存在' }, { status: 404 });
    if (!course.schoolSystem || !course.textbook.trim()) return NextResponse.json({ message: '请先修改该年级目录，补充学制和教材全名，再生成单元目录' }, { status: 400 });
    const verified = verifiedCatalogFor(course);
    if (verified) return NextResponse.json({ ...verified, course, verification: 'user-photo', source: '用户提供的 2026 年 7 月第 1 版五年级上册目录照片' });
    return NextResponse.json({ message: '没有可核对的本册原版目录。请上传目录页识别，或按教材手动录入；AI 不再凭书名编造目录和知识点。' }, { status: 422 });
}
