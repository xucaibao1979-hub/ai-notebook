import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appliedMathTopics, generateAppliedMathQuestions } from '@/lib/applied-math';
import { generateMathQuestions } from '@/lib/mental-math';
import { startPracticeSchema, toolKindSchema, updatePracticeSchema, type PracticeSession } from '@/lib/tool-practice-session';

const reply = (message: string, status: number) => NextResponse.json({ message }, { status });
const querySchema = z.strictObject({ kind: toolKindSchema });
const MAX_BODY = 16_384;

async function body(req: Request): Promise<unknown> {
    if (Number(req.headers.get('content-length')) > MAX_BODY) throw new Error('too-large');
    const reader = req.body?.getReader();
    if (!reader) return JSON.parse('');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY) throw new Error('too-large');
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

function present(row: { kind: string; revision: number; settings: string; questions: string; answers: string; submitted: boolean }): PracticeSession {
    return {
        kind: row.kind,
        revision: row.revision,
        settings: JSON.parse(row.settings),
        questions: JSON.parse(row.questions),
        answers: JSON.parse(row.answers),
        submitted: row.submitted,
    } as PracticeSession;
}

async function userId() {
    return (await getServerSession(authOptions))?.user?.id;
}

export async function GET(req: Request) {
    const id = await userId();
    if (!id) return reply('请先登录', 401);
    const params = new URL(req.url).searchParams;
    const parsed = querySchema.safeParse({ kind: params.get('kind') });
    if (!parsed.success || params.size !== 1) return reply('无效工具类型', 400);
    try {
        const row = await prisma.toolPracticeSession.findUnique({ where: { userId_kind: { userId: id, kind: parsed.data.kind } } });
        return NextResponse.json(row ? present(row) : null, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[practice-session] GET failed', error);
        return reply('读取练习失败，请稍后重试', 503);
    }
}

export async function POST(req: Request) {
    const id = await userId();
    if (!id) return reply('请先登录', 401);
    try {
        const parsed = startPracticeSchema.safeParse(await body(req));
        if (!parsed.success) return reply(parsed.error.issues[0].message, 400);
        const { kind, settings, revision } = parsed.data;
        if (kind === 'applied-math' && settings.topic && !appliedMathTopics(settings.grade).some(item => item.value === settings.topic)) return reply('该年级不支持此知识点', 400);
        // 题目与答案仅由服务端生成，严格校验会拒绝客户端提供的题目。
        const questions = kind === 'mental-math'
            ? generateMathQuestions(settings.mode, settings.count, Math.random, settings.difficulty)
            : generateAppliedMathQuestions(settings.grade, settings.count, settings.topic || undefined);
        const data = { settings: JSON.stringify(settings), questions: JSON.stringify(questions), answers: '{}', submitted: false };
        if (revision === null) {
            const row = await prisma.toolPracticeSession.create({ data: { userId: id, kind, ...data } });
            return NextResponse.json(present(row), { status: 201 });
        }
        const updated = await prisma.toolPracticeSession.updateMany({
            where: { userId: id, kind, revision }, data: { ...data, revision: { increment: 1 } },
        });
        if (updated.count !== 1) return reply('练习已在其他页面更新，请刷新后重试', 409);
        const row = await prisma.toolPracticeSession.findFirst({ where: { userId: id, kind, revision: revision + 1 } });
        if (!row) return reply('练习已在其他页面更新，请刷新后重试', 409);
        return NextResponse.json(present(row));
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError) return reply('请求 JSON 格式错误', 400);
        if (error instanceof Error && error.message === 'too-large') return reply('请求内容过大', 413);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply('练习已在其他页面更新，请刷新后重试', 409);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return reply('用户不存在，请重新登录', 401);
        console.error('[practice-session] POST failed', error);
        return reply('创建练习失败，请稍后重试', 503);
    }
}

export async function PUT(req: Request) {
    const id = await userId();
    if (!id) return reply('请先登录', 401);
    try {
        const parsed = updatePracticeSchema.safeParse(await body(req));
        if (!parsed.success) return reply(parsed.error.issues[0].message, 400);
        const { kind, revision, answers, submitted } = parsed.data;
        const row = await prisma.toolPracticeSession.findUnique({ where: { userId_kind: { userId: id, kind } } });
        if (!row || row.revision !== revision) return reply('练习已在其他页面更新，请刷新后重试', 409);
        if (row.submitted) return reply('已提交的练习不能修改', 409);
        const questions = JSON.parse(row.questions) as { id: number }[];
        if (Object.keys(answers).some(key => !questions.some(question => String(question.id) === key))) return reply('答案包含无效题号', 400);
        const updated = await prisma.toolPracticeSession.updateMany({
            where: { userId: id, kind, revision, submitted: false },
            data: { answers: JSON.stringify(answers), submitted, revision: { increment: 1 } },
        });
        if (updated.count !== 1) return reply('练习已在其他页面更新，请刷新后重试', 409);
        const saved = await prisma.toolPracticeSession.findFirst({ where: { userId: id, kind, revision: revision + 1 } });
        if (!saved) return reply('练习已在其他页面更新，请刷新后重试', 409);
        return NextResponse.json(present(saved));
    } catch (error) {
        if (error instanceof SyntaxError || error instanceof TypeError) return reply('请求 JSON 格式错误', 400);
        if (error instanceof Error && error.message === 'too-large') return reply('请求内容过大', 413);
        console.error('[practice-session] PUT failed', error);
        return reply('保存练习失败，请稍后重试', 503);
    }
}
