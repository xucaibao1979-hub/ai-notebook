import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { storedStudyPreferences } from '@/lib/study-preferences';
import { diagnosisNodes } from '@/lib/knowledge-diagnosis';

async function userId() { const session = await getServerSession(authOptions); return session?.user?.id || null; }
const inputSchema = z.object({ nodeId: z.string().min(1).max(40), page: z.string().trim().max(30).default(''), excerpt: z.string().trim().max(1000).default(''), image: z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,/).max(4_000_000).nullable().optional(), verified: z.boolean().default(false) }).refine(value => value.excerpt || value.image, '请填写原文摘录或上传教材照片');

export async function GET(request: Request) {
  const id = await userId(); if (!id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  if (params.get('image')) {
    const row = await prisma.textbookEvidence.findFirst({ where: { id: params.get('image')!, userId: id }, select: { image: true } });
    if (!row?.image) return NextResponse.json({ message: '照片不存在' }, { status: 404 });
    const match = row.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([\s\S]*)$/);
    if (!match) return NextResponse.json({ message: '照片格式无效' }, { status: 500 });
    return new Response(Buffer.from(match[2], 'base64'), { headers: { 'Content-Type': match[1], 'Cache-Control': 'private, no-store' } });
  }
  const rows = await prisma.textbookEvidence.findMany({ where: { userId: id, ...(params.get('nodeId') ? { nodeId: params.get('nodeId')! } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  return NextResponse.json({ items: rows.map(({ image, ...row }) => ({ ...row, hasImage: !!image })) });
}

export async function POST(request: Request) {
  const id = await userId(); if (!id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ message: input.error.issues[0].message }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id }, select: { studyPreferences: true } });
  if (!user) return NextResponse.json({ message: '用户不存在' }, { status: 404 });
  const node = diagnosisNodes(storedStudyPreferences(user.studyPreferences)).find(node => node.id === input.data.nodeId);
  if (!node) return NextResponse.json({ message: '知识点已变化，请刷新' }, { status: 409 });
  const row = await prisma.textbookEvidence.create({ data: { userId: id, nodeId: node.id, unitId: node.unitId, page: input.data.page, excerpt: input.data.excerpt, image: input.data.image || null, verified: input.data.verified, sourceSnapshot: JSON.stringify({ subject: node.subject, publisher: node.publisher, textbook: node.textbook, edition: node.edition, isbn: node.isbn, grade: node.grade, volume: node.volume, chapter: node.chapter }) } });
  return NextResponse.json({ id: row.id });
}

export async function DELETE(request: Request) {
  const id = await userId(); if (!id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const evidenceId = new URL(request.url).searchParams.get('id');
  if (!evidenceId) return NextResponse.json({ message: '缺少证据编号' }, { status: 400 });
  await prisma.textbookEvidence.deleteMany({ where: { id: evidenceId, userId: id } });
  return NextResponse.json({ ok: true });
}
