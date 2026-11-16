import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { diagnosisNodes, diagnosisSummary, type DiagnosisState } from '@/lib/knowledge-diagnosis';
import { studyPreferences } from '@/lib/study-preferences';
import { completePathStep, createLearningPath, type PathState } from '@/lib/learning-path';

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, studyPreferences: true } });
  return user ? { id: user.id, nodes: diagnosisNodes(studyPreferences(user.studyPreferences)) } : null;
}
const expose = (row: { id: string; diagnosisSessionId: string; state: string; createdAt: Date; updatedAt: Date }) => ({ id: row.id, diagnosisSessionId: row.diagnosisSessionId, state: JSON.parse(row.state) as PathState, createdAt: row.createdAt, updatedAt: row.updatedAt });

export async function GET(request: Request) {
  const ctx = await context(); if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const rows = await prisma.learningPath.findMany({ where: { userId: ctx.id, ...(id ? { id } : {}) }, orderBy: { updatedAt: 'desc' }, take: 30 });
  return NextResponse.json({ items: rows.map(expose), nodes: ctx.nodes });
}

export async function POST(request: Request) {
  const ctx = await context(); if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const parsed = z.object({ diagnosisSessionId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: '诊断记录无效' }, { status: 400 });
  const diagnosis = await prisma.diagnosisSession.findFirst({ where: { id: parsed.data.diagnosisSessionId, userId: ctx.id } });
  if (!diagnosis) return NextResponse.json({ message: '诊断记录不存在' }, { status: 404 });
  const state = JSON.parse(diagnosis.state) as DiagnosisState;
  if (state.currentId || !state.answers.length) return NextResponse.json({ message: '请先完成诊断，再建立学习路径' }, { status: 409 });
  const edges = await prisma.knowledgePrerequisite.findMany({ where: { userId: ctx.id } });
  const summary = diagnosisSummary(state, ctx.nodes, edges.map(edge => ({ ...edge, strength: edge.strength as 'hard' | 'soft' })));
  const targets = summary.path.length ? summary.path : (JSON.parse(diagnosis.targetIds) as string[]);
  const valid = targets.filter(id => ctx.nodes.some(node => node.id === id)).slice(0, 20);
  if (!valid.length) return NextResponse.json({ message: '原有知识点已变更，无法建立学习路径' }, { status: 409 });
  const row = await prisma.learningPath.upsert({ where: { userId_diagnosisSessionId: { userId: ctx.id, diagnosisSessionId: diagnosis.id } }, create: { userId: ctx.id, diagnosisSessionId: diagnosis.id, state: JSON.stringify(createLearningPath(valid)) }, update: {} });
  return NextResponse.json(expose(row));
}

export async function PATCH(request: Request) {
  const ctx = await context(); if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const parsed = z.object({ id: z.string().min(1), index: z.number().int().min(0), setId: z.string().optional(), retestSessionId: z.string().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: '步骤数据无效' }, { status: 400 });
  const row = await prisma.learningPath.findFirst({ where: { id: parsed.data.id, userId: ctx.id } });
  if (!row) return NextResponse.json({ message: '学习路径不存在' }, { status: 404 });
  const state = JSON.parse(row.state) as PathState;
  const step = state.steps[parsed.data.index];
  if (!step || state.current !== parsed.data.index) return NextResponse.json({ message: '请按顺序完成学习步骤' }, { status: 409 });
  if (step.kind === 'example' || step.kind === 'practice') {
    const node = ctx.nodes.find(node => node.id === step.nodeId);
    if (!node) return NextResponse.json({ message: '知识点已变化' }, { status: 409 });
    const candidates = await prisma.learningSet.findMany({ where: { userId: ctx.id, source: 'ai', createdAt: { gte: row.updatedAt } }, orderBy: { createdAt: 'desc' }, take: 25, select: { id: true, questions: true, parameters: true } });
    const set = candidates.find(candidate => (parsed.data.setId ? candidate.id === parsed.data.setId : true) && (() => { try { const p = JSON.parse(candidate.parameters); return p.knowledgePoint === node.term && p.subject === node.subject; } catch { return false; } })());
    if (!set) return NextResponse.json({ message: '练习不存在' }, { status: 404 });
    const questions = JSON.parse(set.questions) as { knowledgePoints?: string[] }[];
    if (questions.length < (step.kind === 'practice' ? 3 : 1)) return NextResponse.json({ message: '本次练习题数不足' }, { status: 400 });
    const records = await prisma.practiceRecord.count({ where: { userId: ctx.id, learningSetId: set.id, isCorrect: { not: null } } });
    if (records < (step.kind === 'practice' ? 3 : 1)) return NextResponse.json({ message: `请先完成${step.kind === 'practice' ? '3' : '1'}道题并完成自评` }, { status: 400 });
    parsed.data.setId = set.id;
  }
  if (step.kind === 'retest') {
    const diagnosis = await prisma.diagnosisSession.findFirst({ where: { userId: ctx.id, createdAt: { gte: row.updatedAt }, ...(parsed.data.retestSessionId ? { id: parsed.data.retestSessionId } : { targetIds: { contains: step.nodeId } }) }, orderBy: { createdAt: 'desc' } });
    if (!diagnosis) return NextResponse.json({ message: '请先完成再测' }, { status: 400 });
    const retest = JSON.parse(diagnosis.state) as DiagnosisState;
    if (retest.currentId || !retest.answers.some(answer => answer.topicId === step.nodeId)) return NextResponse.json({ message: '再测尚未完成当前知识点' }, { status: 400 });
    parsed.data.retestSessionId = diagnosis.id;
  }
  let next: PathState;
  try { next = completePathStep(state, parsed.data.index, { setId: parsed.data.setId, retestSessionId: parsed.data.retestSessionId }); }
  catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 409 }); }
  const updated = await prisma.learningPath.updateMany({ where: { id: row.id, userId: ctx.id, state: row.state }, data: { state: JSON.stringify(next) } });
  if (!updated.count) return NextResponse.json({ message: '学习路径已变化，请刷新后重试' }, { status: 409 });
  return NextResponse.json({ ...expose(row), state: next });
}
