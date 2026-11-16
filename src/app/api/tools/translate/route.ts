import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getAIService } from '@/lib/ai';
import { modelErrorMessage } from '@/lib/ai/error-message';
import { parseAIJson } from '@/lib/ai/schema';
import { prisma } from '@/lib/prisma';

export const maxDuration = 90;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 5_600_000;
const inputSchema = z.object({ image: z.string(), direction: z.enum(['zh-en', 'en-zh']) });
const resultSchema = z.object({ sourceText: z.string().max(4000), translatedText: z.string().max(4000) });
const TRANSLATE_KIND = 'translate-image';

// 单条 SQLite 写语句完成配额检查与占位，避免多个实例各自先查后写的竞态。
async function reserveTranslation(userId: string, requestHash: string) {
    const now = Date.now();
    const id = randomUUID();
    const rows = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO "StudyTask" ("id", "userId", "kind", "requestHash", "input", "status", "phase", "progress", "createdAt", "updatedAt")
        SELECT ${id}, ${userId}, ${TRANSLATE_KIND}, ${requestHash}, '{}', 'pending', '等待开始', 0, ${now}, ${now}
        WHERE (SELECT COUNT(*) FROM "StudyTask"
               WHERE "userId" = ${userId} AND "kind" = ${TRANSLATE_KIND} AND "createdAt" >= ${now - 3600_000}) < 10
          AND NOT EXISTS (SELECT 1 FROM "StudyTask"
               WHERE "userId" = ${userId} AND "kind" = ${TRANSLATE_KIND} AND "status" = 'pending'
               AND "updatedAt" >= ${now - 90_000})
          AND NOT EXISTS (SELECT 1 FROM "StudyTask"
               WHERE "userId" = ${userId} AND "kind" = ${TRANSLATE_KIND} AND "requestHash" = ${requestHash}
               AND "status" = 'completed' AND "createdAt" >= ${now - 60_000})
        RETURNING "id"`;
    return rows.length ? id : null;
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });

    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ message: '请上传图片' }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_BODY_BYTES) {
                await reader.cancel();
                return NextResponse.json({ message: '图片不能超过 4MB' }, { status: 413 });
            }
            chunks.push(value);
        }
    } catch {
        return NextResponse.json({ message: '图片上传失败，请重试' }, { status: 400 });
    } finally {
        reader.releaseLock();
    }
    const input = inputSchema.safeParse((() => {
        try { return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks))); }
        catch { return null; }
    })());
    if (!input.success) return NextResponse.json({ message: '请求格式无效，请选择翻译方向和图片' }, { status: 400 });

    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.data.image);
    if (!match || match[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
        return NextResponse.json({ message: '仅支持 JPEG、PNG、WebP 图片，最大 4MB' }, { status: 400 });
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64') !== match[2]) {
        return NextResponse.json({ message: '图片无效或超过 4MB' }, { status: 400 });
    }
    const mime = match[1];
    const valid = mime === 'image/jpeg' ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        : mime === 'image/png' ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) return NextResponse.json({ message: '图片格式与文件内容不一致' }, { status: 400 });

    const direction = input.data.direction === 'zh-en' ? '中文翻译成英文' : '英文翻译成中文';
    const requestHash = createHash('sha256').update(input.data.direction).update(bytes).digest('hex');
    let reservation: string | null;
    try {
        reservation = await reserveTranslation(session.user.id, requestHash);
    } catch {
        return NextResponse.json({ message: '翻译暂不可用，请稍后重试' }, { status: 503 });
    }
    if (!reservation) return NextResponse.json({ message: '翻译请求过于频繁或正在处理，请稍后重试' }, { status: 429 });

    let status = 'failed';
    try {
        const ai = getAIService('analyze', session.user.id);
        const raw = await ai.translateImage(match[2], mime, `识别图片中的文字，并将其从${direction}。sourceText 保留原文的换行和阅读顺序；translatedText 给出对应译文。图片中其他语言的内容不要猜测或翻译。只返回 JSON。`);
        let result: z.infer<typeof resultSchema>;
        try {
            if (raw.length > 10000) throw new Error('AI_RESPONSE_ERROR');
            result = parseAIJson(raw, resultSchema);
        } catch { throw new Error('AI_RESPONSE_ERROR'); }
        status = 'completed';
        return NextResponse.json(result);
    } catch (error) {
        const timeout = error instanceof Error && /AI_TIMEOUT_ERROR|timeout|aborted/i.test(error.message);
        return NextResponse.json({ message: modelErrorMessage(error) }, { status: timeout ? 504 : 502 });
    } finally {
        try {
            await prisma.studyTask.update({ where: { id: reservation }, data: { status } });
        } catch { /* 占位记录最多阻塞 90 秒，到期后允许重试。 */ }
    }
}
