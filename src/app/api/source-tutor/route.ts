import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { storedStudyPreferences } from '@/lib/study-preferences';
import { diagnosisNodes } from '@/lib/knowledge-diagnosis';
import { getAIService } from '@/lib/ai';
import { modelErrorMessage } from '@/lib/ai/error-message';

export const maxDuration = 120;
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const nodeId = new URL(request.url).searchParams.get('nodeId');
  if (!nodeId) return NextResponse.json({ items: [] });
  const items = await prisma.sourceTutorNote.findMany({ where: { userId: session.user.id, nodeId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return NextResponse.json({ items });
}
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const parsed = z.object({ nodeId: z.string(), evidenceId: z.string().optional(), action: z.enum(['explain', 'example']) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: '请选择知识点和操作' }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { studyPreferences: true } });
  if (!user) return NextResponse.json({ message: '用户不存在' }, { status: 404 });
  const node = diagnosisNodes(storedStudyPreferences(user.studyPreferences)).find(node => node.id === parsed.data.nodeId);
  if (!node) return NextResponse.json({ message: '知识点已变化' }, { status: 409 });
  const evidence = parsed.data.evidenceId ? await prisma.textbookEvidence.findFirst({ where: { id: parsed.data.evidenceId, userId: session.user.id, nodeId: node.id } }) : null;
  if (parsed.data.evidenceId && !evidence) return NextResponse.json({ message: '教材证据不存在' }, { status: 404 });
  if (evidence) {
    const snapshot = JSON.parse(evidence.sourceSnapshot || '{}') as Record<string,string>;
    if (['publisher','textbook','edition','isbn','grade','volume','chapter'].some(key => snapshot[key] && snapshot[key] !== node[key as keyof typeof node])) return NextResponse.json({ message: '这条依据属于旧教材版本，请重新核对后使用' }, { status: 409 });
  }
  const reference = evidence?.excerpt || node.meaning;
  if (!reference) return NextResponse.json({ message: '请先补充教材原文或知识点内容' }, { status: 400 });
  const instruction = parsed.data.action === 'explain' ? '用适合该年级的语言解释这段内容，指出关键概念及一个易错点。' : '给出一个与这段内容相关、可独立理解的例子和分步说明。';
  try {
    const ai = getAIService('review', session.user.id);
    const result = await ai.reanswerQuestion(`教材信息：${node.publisher}《${node.textbook}》${node.grade}${node.volume}，${node.chapter}${evidence?.page ? `第${evidence.page}页` : ''}。\n已录入内容：${reference}\n任务：${instruction}\n仅以已录入内容为依据；若材料不足，明确指出不能确定的部分。不要假称看到了未提供的教材原文。`, 'zh', node.subject);
    const text = [result.answerText, result.analysis].filter(Boolean).join('\n\n');
    const saved = await prisma.sourceTutorNote.create({ data: { userId: session.user.id, nodeId: node.id, evidenceId: evidence?.id || null, action: parsed.data.action, text, sourceSnapshot: JSON.stringify({ subject: node.subject, publisher: node.publisher, textbook: node.textbook, edition: node.edition, isbn: node.isbn, grade: node.grade, volume: node.volume, chapter: node.chapter, page: evidence?.page || '' }) } });
    return NextResponse.json({ id: saved.id, text, source: { nodeId: node.id, evidenceId: evidence?.id || null, label: evidence?.verified ? '用户已核对的教材摘录' : '尚未核对的教材摘录或知识点' } });
  } catch (error) { return NextResponse.json({ message: modelErrorMessage(error) }, { status: 502 }); }
}
