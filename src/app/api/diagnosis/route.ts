import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { studyPreferences } from '@/lib/study-preferences';
import { answerDiagnosis, correctLatestDiagnosisAnswer, diagnosisNodes, diagnosisSummary, startDiagnosis, wouldCreateCycle, type DiagnosisEdge, type DiagnosisState } from '@/lib/knowledge-diagnosis';

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, studyPreferences: true } });
  return user ? { user, nodes: diagnosisNodes(studyPreferences(user.studyPreferences)) } : null;
}

async function graph(userId: string) {
  return (await prisma.knowledgePrerequisite.findMany({ where: { userId } })).map(edge => ({ id: edge.id, topicId: edge.topicId, prerequisiteId: edge.prerequisiteId, strength: edge.strength as 'hard' | 'soft', reason: edge.reason }));
}

export async function GET(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const edges = await graph(ctx.user.id);
  const id = params.get('id');
  if (id) {
    const row = await prisma.diagnosisSession.findFirst({ where: { id, userId: ctx.user.id } });
    if (!row) return NextResponse.json({ message: '诊断记录不存在' }, { status: 404 });
    const state = JSON.parse(row.state) as DiagnosisState;
    return NextResponse.json({ session: { id: row.id, subject: row.subject, mode: row.mode, targetIds: JSON.parse(row.targetIds), state, summary: diagnosisSummary(state, ctx.nodes, edges), createdAt: row.createdAt }, nodes: ctx.nodes, edges });
  }
  const history = await prisma.diagnosisSession.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ nodes: ctx.nodes, edges: edges.filter(edge => ctx.nodes.some(node => node.id === edge.topicId) && ctx.nodes.some(node => node.id === edge.prerequisiteId)), history: history.map(row => { const state = JSON.parse(row.state) as DiagnosisState; return { id: row.id, subject: row.subject, mode: row.mode, targetIds: JSON.parse(row.targetIds), createdAt: row.createdAt, summary: diagnosisSummary(state, ctx.nodes, edges) }; }) });
}

const edgeInput = z.object({ action: z.literal('addEdge'), topicId: z.string(), prerequisiteId: z.string(), strength: z.enum(['hard', 'soft']), reason: z.string().trim().max(300).default('') });
const sessionInput = z.object({ action: z.literal('start'), targetIds: z.array(z.string()).min(1).max(30), mode: z.enum(['target', 'screen']).default('target') });
const answerInput = z.object({ action: z.literal('answer'), id: z.string(), topicId: z.string(), correct: z.boolean(), question: z.string().max(500), setId: z.string().optional() });

export async function POST(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.action === 'addEdge') {
    const input = edgeInput.safeParse(body);
    if (!input.success) return NextResponse.json({ message: '先修关系输入无效' }, { status: 400 });
    const { topicId, prerequisiteId, strength, reason } = input.data;
    const topic = ctx.nodes.find(node => node.id === topicId), prerequisite = ctx.nodes.find(node => node.id === prerequisiteId);
    if (!topic || !prerequisite || topic.subject !== prerequisite.subject) return NextResponse.json({ message: '请选择同一科目的两个有效知识点' }, { status: 400 });
    const edges = await graph(ctx.user.id);
    if (wouldCreateCycle(edges, topicId, prerequisiteId)) return NextResponse.json({ message: '该关系会形成循环' }, { status: 400 });
    const row = await prisma.knowledgePrerequisite.upsert({ where: { userId_topicId_prerequisiteId: { userId: ctx.user.id, topicId, prerequisiteId } }, create: { userId: ctx.user.id, subject: topic.subject, topicId, prerequisiteId, strength, reason }, update: { strength, reason } });
    return NextResponse.json({ id: row.id });
  }
  if (body?.action === 'start') {
    const input = sessionInput.safeParse(body);
    if (!input.success) return NextResponse.json({ message: '请选择有效知识点' }, { status: 400 });
    const selected = input.data.targetIds.map(id => ctx.nodes.find(node => node.id === id));
    if (selected.some(node => !node) || new Set(selected.map(node => node?.subject)).size !== 1) return NextResponse.json({ message: '只能诊断同一科目的现有知识点' }, { status: 400 });
    const state = startDiagnosis(input.data.targetIds, input.data.mode, Math.min(80, input.data.targetIds.length * 6));
    const row = await prisma.diagnosisSession.create({ data: { userId: ctx.user.id, subject: selected[0]!.subject, mode: input.data.mode, targetIds: JSON.stringify(input.data.targetIds), state: JSON.stringify(state) } });
    return NextResponse.json({ id: row.id });
  }
  if (body?.action === 'answer') {
    const input = answerInput.safeParse(body);
    if (!input.success) return NextResponse.json({ message: '作答数据无效' }, { status: 400 });
    const row = await prisma.diagnosisSession.findFirst({ where: { id: input.data.id, userId: ctx.user.id } });
    if (!row) return NextResponse.json({ message: '诊断记录不存在' }, { status: 404 });
    let source: 'graded' | 'self' = 'self';
    if (input.data.setId) {
      const set = await prisma.learningSet.findFirst({ where: { id: input.data.setId, userId: ctx.user.id }, include: { records: { where: { exerciseIndex: 0 }, take: 1 } } });
      const exercise = set ? (JSON.parse(set.questions) as { questionText: string; correctOption?: string }[])[0] : null;
      if (!exercise || exercise.questionText !== input.data.question || set?.records[0]?.isCorrect !== input.data.correct) return NextResponse.json({ message: '练习作答与诊断结果不一致' }, { status: 409 });
      source = exercise.correctOption ? 'graded' : 'self';
    }
    const edges = await graph(ctx.user.id);
    let next: DiagnosisState;
    try { next = answerDiagnosis(JSON.parse(row.state) as DiagnosisState, input.data.topicId, input.data.correct, input.data.question, edges, source, input.data.setId); }
    catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : '诊断状态已变化' }, { status: 409 }); }
    const result = await prisma.diagnosisSession.updateMany({ where: { id: row.id, userId: ctx.user.id, state: row.state }, data: { state: JSON.stringify(next) } });
    if (!result.count) return NextResponse.json({ message: '诊断状态已变化，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ state: next, summary: diagnosisSummary(next, ctx.nodes, edges) });
  }
  return NextResponse.json({ message: '未知操作' }, { status: 400 });
}

export async function PATCH(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const input = z.object({ id: z.string(), correct: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ message: '修正数据无效' }, { status: 400 });
  const row = await prisma.diagnosisSession.findFirst({ where: { id: input.data.id, userId: ctx.user.id } });
  if (!row) return NextResponse.json({ message: '诊断记录不存在' }, { status: 404 });
  const edges = await graph(ctx.user.id);
  let next: DiagnosisState;
  try { next = correctLatestDiagnosisAnswer(JSON.parse(row.state) as DiagnosisState, JSON.parse(row.targetIds) as string[], input.data.correct, edges); }
  catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 409 }); }
  const result = await prisma.diagnosisSession.updateMany({ where: { id: row.id, userId: ctx.user.id, state: row.state }, data: { state: JSON.stringify(next) } });
  if (!result.count) return NextResponse.json({ message: '记录已变化，请刷新后重试' }, { status: 409 });
  return NextResponse.json({ state: next, summary: diagnosisSummary(next, ctx.nodes, edges) });
}

export async function DELETE(request: Request) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('edgeId');
  if (!id) return NextResponse.json({ message: '缺少关系编号' }, { status: 400 });
  await prisma.knowledgePrerequisite.deleteMany({ where: { id, userId: ctx.user.id } });
  return NextResponse.json({ ok: true });
}
