import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getAIService } from '@/lib/ai';
import { modelErrorMessage } from '@/lib/ai/error-message';

export const maxDuration = 300;
const image = z.string().max(12_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/);
const input = z.object({ images: z.array(image).min(1).max(4), subject: z.string().trim().min(1).max(50), unit: z.string().trim().min(1).max(100) });
const entry = z.object({ kind: z.enum(['单词', '短语', '句子', '知识点']), term: z.string().trim().min(1).max(240), meaning: z.string().trim().min(1).max(500) });
const response = z.object({ entries: z.array(entry).max(120) });
function parseAnswer(answer: string) {
    const clean = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('PHOTO_KNOWLEDGE_FORMAT');
    return response.parse(JSON.parse(clean.slice(start, end + 1)));
}
export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: '请上传 1—4 张清晰的本单元词表、句型或知识点页' }, { status: 400 });
    try {
        const ai = getAIService('homework', session.user.id);
        const results = await Promise.allSettled(parsed.data.images.map(async dataUrl => {
            const prompt = `这是一张${parsed.data.subject}教材中「${parsed.data.unit}」单元的学习内容页。只转录照片上清晰可见、属于本单元的单词、短语、句子或明确列出的知识点，以及照片中对应的解释或翻译。不能根据单元名、常识或其他版本补充内容；看不清或没有对应解释的项目请省略。保留教材上的原文语言和拼写，不能将英文标题或英文知识内容改写为中文主题。不要提取练习题及答案。只返回 JSON：{"entries":[{"kind":"单词","term":"教材原文","meaning":"照片中对应释义"}]}。kind 只能为单词、短语、句子、知识点；没有可核对内容时返回空数组。`;
            return parseAnswer(await ai.extractTextbookCatalogPage(dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl.match(/^data:([^;]+)/)![1], prompt));
        }));
        const seen = new Set<string>();
        const entries = results.flatMap(result => result.status === 'fulfilled' ? result.value.entries : []).filter(row => {
            const key = `${row.kind}:${row.term.toLowerCase()}`;
            if (seen.has(key)) return false;
            seen.add(key); return true;
        });
        if (!entries.length) return NextResponse.json({ message: '未识别到带释义的教材原文。请上传清晰的词表或单元总结页；不会凭单元标题补写。' }, { status: 422 });
        return NextResponse.json({ entries, recognizedPages: results.filter(result => result.status === 'fulfilled').length, totalPages: parsed.data.images.length });
    } catch (error) {
        return NextResponse.json({ message: modelErrorMessage(error) }, { status: 502 });
    }
}
