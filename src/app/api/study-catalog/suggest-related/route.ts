import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { catalogCourses } from '@/lib/study-catalog';
import { studyPreferences } from '@/lib/study-preferences';

const input = z.object({ courseId: z.string().min(1).max(100), mode: z.enum(['companion', 'knowledge']) });

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: '请选择教材目录和操作' }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { studyPreferences: true } });
    if (!user) return NextResponse.json({ message: '用户不存在' }, { status: 404 });
    const course = catalogCourses(studyPreferences(user.studyPreferences)).find(item => item.id === parsed.data.courseId);
    if (!course) return NextResponse.json({ message: '教材目录不存在' }, { status: 404 });

    const message = parsed.data.mode === 'companion'
        ? '仅凭本册无法核实另一册的原版目录。请上传另一册的目录页，识别并核对后保存。'
        : '仅凭单元标题无法还原教材的单词、短语、句子和知识点。请录入教材内容；原有目录不会改变。';
    return NextResponse.json({ message }, { status: 422 });
}
