import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { codexLoginStatus, logoutCodex, startCodexLogin } from '@/lib/ai/codex-cli';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function authorized() {
    const session = await getServerSession(authOptions);
    return session?.user?.role === 'admin';
}

export async function GET() {
    if (!await authorized()) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    return NextResponse.json(await codexLoginStatus());
}

export async function POST() {
    if (!await authorized()) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    try {
        const authUrl = await startCodexLogin();
        return NextResponse.json({ started: true, authUrl });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : '无法打开 Codex 登录' }, { status: 500 });
    }
}

export async function DELETE() {
    if (!await authorized()) return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    try {
        await logoutCodex();
        return NextResponse.json({ loggedIn: false });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : '退出登录失败' }, { status: 500 });
    }
}
