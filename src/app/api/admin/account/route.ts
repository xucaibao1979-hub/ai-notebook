import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const accountSchema = z.object({
    username: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/, '用户名仅支持字母、数字、下划线、点和短横线'),
    currentPassword: z.string().min(1).max(128),
    password: z.string().min(5, '密码至少 5 个字符').max(128).optional(),
});

async function adminAccount() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    return user?.isActive && user.role === 'admin' ? user : null;
}

export async function GET() {
    const user = await adminAccount();
    if (!user) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    return NextResponse.json({ username: user.username || '', email: user.email });
}

export async function PATCH(req: Request) {
    const user = await adminAccount();
    if (!user) return NextResponse.json({ message: '需要管理员权限' }, { status: 403 });
    try {
        const { username, currentPassword, password } = accountSchema.parse(await req.json());
        if (!(await compare(currentPassword, user.password))) {
            return NextResponse.json({ message: '当前密码不正确' }, { status: 400 });
        }
        const collision = await prisma.user.findFirst({
            where: { id: { not: user.id }, OR: [{ username }, { email: username }] },
        });
        if (collision) return NextResponse.json({ message: '该用户名已被使用' }, { status: 409 });
        await prisma.user.update({
            where: { id: user.id },
            data: { username, ...(password ? { password: await hash(password, 12) } : {}) },
        });
        return NextResponse.json({ username, message: '登录信息已更新，请使用新信息重新登录' });
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            return NextResponse.json({ message: '该用户名已被使用' }, { status: 409 });
        }
        return NextResponse.json({ message: '更新账号失败，请重试' }, { status: 500 });
    }
}
