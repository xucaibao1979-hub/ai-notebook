import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateExercises, LearningError } from '@/lib/learning-service';
import { modelErrorMessage } from '@/lib/ai/error-message';
import { formulaById, formulaQuestionKey } from '@/lib/math-formulas';
import { formulaLearningNotes } from '@/lib/math-formula-learning';
import type { LearningRequest } from '@/lib/learning';

export const maxDuration = 300;
const input = z.object({ formulaId: z.string().min(1).max(80), difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'), variation: z.union([z.literal(1), z.literal(2)]).optional() });
const prefix = (id: string) => `formula:${id}:`;

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const formulaId = new URL(request.url).searchParams.get('formulaId') || '';
  const formula = formulaById(formulaId);
  if (!formula) return NextResponse.json({ message: '请选择有效公式' }, { status: 400 });
  const rows = await prisma.learningSet.findMany({ where: { userId: session.user.id, selectionKey: { startsWith: prefix(formula.id) }, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, createdAt: true, questions: true, parameters: true, favorited: true } });
  const items = rows.flatMap(row => {
    try {
      const question = (JSON.parse(row.questions) as { questionText: string; answerText?: string; analysis?: string; subject?: string }[])[0];
      const parameters = JSON.parse(row.parameters) as { formulaId?: string; variation?: number; subject?: string; prompt?: string };
      if (!question?.questionText || question.subject !== '数学' || parameters.formulaId !== formula.id || parameters.subject !== '数学' || /单词|英语|词汇|vocabulary|\bEnglish\b/i.test(question.questionText)) return [];
      const legacyVariation = parameters.prompt?.match(/重点考查变式\s*([12])\b/);
      const variation = parameters.variation === 1 || parameters.variation === 2 ? parameters.variation : legacyVariation ? Number(legacyVariation[1]) : null;
      return [{ id: row.id, createdAt: row.createdAt, questionText: question.questionText, answerText: question.answerText || '', analysis: question.analysis || '', variation, favorited: row.favorited }];
    } catch { return []; }
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: '请选择公式和难度' }, { status: 400 });
  const formula = formulaById(parsed.data.formulaId);
  if (!formula) return NextResponse.json({ message: '公式不存在，请刷新后重试' }, { status: 404 });
  const variation = parsed.data.variation ? formulaLearningNotes(formula).variations[parsed.data.variation - 1] : null;
  const userId = session.user.id;
  const requestKey = prefix(formula.id);
  const existing = await prisma.learningSet.findMany({ where: { userId, selectionKey: { startsWith: requestKey } }, select: { questions: true } });
  const seen = new Set(existing.flatMap(row => { try { return (JSON.parse(row.questions) as { questionText: string }[]).map(question => formulaQuestionKey(question.questionText)); } catch { return []; } }));
  const previousStems = existing.flatMap(row => { try { return (JSON.parse(row.questions) as { questionText: string }[]).map(question => question.questionText); } catch { return []; } });
  const requestData: LearningRequest = { mode: 'ai', source: 'ai', subject: '数学', grade: formula.grade, count: 1, difficulty: parsed.data.difficulty, knowledgePoint: formula.name, prompt: `只考查${formula.stage}数学“${formula.name}”。公式：${formula.latex}。适用条件：${formula.condition}。${variation ? `重点考查${variation.title}：${variation.expression}。应用方法：${variation.use}。` : '重点考查该公式的变式应用。'}参考${formula.stage === '高中' ? '高考' : formula.stage === '初中' ? '中考' : '小学综合练习'}常见题型改编，不能声称来自某年某地真题。设计一道${formula.grade}学生可独立作答的举一反三新题。严格控制在该学段范围内，必须满足适用条件，题干完整、答案唯一且可验证；改变数值、情境和解题步骤，不复用以前的题干。` };
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const avoid = previousStems.slice(-10).map(text => text.slice(0, 100)).join('；').slice(0, 1100);
      const questions = await generateExercises(userId, { ...requestData, prompt: `${requestData.prompt}${avoid ? `不要重复这些已保存题目：${avoid}。` : ''}${attempt ? `这是第 ${attempt + 1} 次尝试，请采用不同于常见例题的情境和表达。` : ''}` });
      const question = questions[0];
      if (!question || question.subject !== '数学' || /单词|英语|词汇|vocabulary|\bEnglish\b/i.test(question.questionText)) { if (question?.questionText) previousStems.push(question.questionText); continue; }
      const key = formulaQuestionKey(question.questionText);
      if (!key || seen.has(key)) { previousStems.push(question.questionText); continue; }
      question.provenance = { ...question.provenance, name: `${formula.stage}数学公式 · ${formula.level1} / ${formula.level2}`, url: formula.sourceUrl, grade: formula.grade, topicId: formula.id };
      const hash = createHash('sha256').update(key).digest('hex');
      try {
        const saved = await prisma.learningSet.create({ data: { userId, dateKey: 'formula', selectionKey: `${requestKey}${hash}`, source: 'ai', title: `${formula.name} · 公式练习`, questions: JSON.stringify([question]), parameters: JSON.stringify({ ...requestData, formulaId: formula.id, variation: parsed.data.variation || null }) } });
        return NextResponse.json({ id: saved.id, questionText: question.questionText, answerText: question.answerText || '', analysis: question.analysis || '', variation: parsed.data.variation || null, favorited: false, createdAt: saved.createdAt || new Date(), formulaId: formula.id }, { status: 201 });
      } catch (error) {
        // A concurrent request may have saved the same normalized question first.
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') { seen.add(key); previousStems.push(question.questionText); continue; }
        throw error;
      }
    } catch (error) {
      if (error instanceof LearningError && error.status === 422) return NextResponse.json({ message: error.message }, { status: 422 });
      return NextResponse.json({ message: modelErrorMessage(error) }, { status: 502 });
    }
  }
  return NextResponse.json({ message: '本次生成的题目与历史题目过于相似，未保存。请稍后重试或切换公式。' }, { status: 409 });
}
