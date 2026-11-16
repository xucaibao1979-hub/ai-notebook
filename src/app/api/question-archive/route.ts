import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import type { LearningExercise } from '@/lib/learning';

type ArchiveItem = { id: string; source: string; title: string; subject: string; questions: number; answered: number; knowledgePoints: string[]; createdAt: Date; href: string; nextReview?: Date | null; preview: string[] };
const parse = <T,>(raw: string, fallback: T): T => { try { return JSON.parse(raw) as T; } catch { return fallback; } };
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const subject = (params.get('subject') || '').trim().slice(0, 50);
  const search = (params.get('search') || '').trim().toLocaleLowerCase().slice(0, 100);
  const userId = session.user.id;
  const [sets, homework, errors, attempts] = await Promise.all([
    prisma.learningSet.findMany({ where: { userId, archivedAt: null }, include: { records: true }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.homeworkReview.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.errorItem.findMany({ where: { userId, archivedAt: null }, include: { subject: true, tags: true, reviewSchedules: { where: { completedAt: null }, orderBy: { scheduledFor: 'asc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, take: 80 }),
    prisma.paperAttempt.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 80 }),
  ]);
  const papers = await prisma.knowledgePaper.findMany({ where: { id: { in: attempts.map(attempt => attempt.paperId) } }, select: { id: true, title: true, subject: true, questions: true } });
  const byPaper = new Map(papers.map(paper => [paper.id, paper]));
  const items: ArchiveItem[] = [
    ...sets.map(set => { const questions = parse<LearningExercise[]>(set.questions, []); return { id: set.id, source: set.source === 'ai' ? 'AI练习' : '历史练习', title: set.title, subject: questions[0]?.subject || '', questions: questions.length, answered: set.records.filter(record => record.isCorrect !== null).length, knowledgePoints: [...new Set(questions.flatMap(question => question.knowledgePoints || []))], createdAt: set.createdAt, href: `/ai-practice?set=${encodeURIComponent(set.id)}`, preview: questions.slice(0, 3).map(question => question.questionText) }; }),
    ...homework.map(item => { const questions = parse<{ questionText?: string; knowledgePoints?: string[]; subject?: string; judgement?: string }[]>(item.scanQuestions || item.questions, []); return { id: item.id, source: '拍照作业', title: `作业批改 · ${item.createdAt.toLocaleDateString('zh-CN')}`, subject: questions[0]?.subject || '', questions: questions.length, answered: questions.filter(question => question.judgement !== 'unanswered').length, knowledgePoints: [...new Set(questions.flatMap(question => question.knowledgePoints || []))], createdAt: item.createdAt, href: `/homework?record=${encodeURIComponent(item.id)}`, preview: questions.slice(0, 3).map(question => question.questionText || '') }; }),
    ...errors.map(item => ({ id: item.id, source: '错题本', title: item.questionText?.slice(0, 80) || '错题', subject: item.subject?.name || '', questions: 1, answered: item.masteryLevel > 0 ? 1 : 0, knowledgePoints: item.tags.map(tag => tag.name), createdAt: item.createdAt, href: `/error-items/${encodeURIComponent(item.id)}`, nextReview: item.reviewSchedules[0]?.scheduledFor, preview: [item.questionText || item.ocrText || ''] })),
    ...attempts.map(item => { const paper = byPaper.get(item.paperId); const questions = parse<{ knowledgePoints?: string[]; questionText?: string; correctedMarkdown?: string }[]>(paper?.questions || '[]', []); const answers = parse<Record<string, unknown>>(item.answers, {}); return { id: item.id, source: '试卷', title: paper?.title || '试卷练习', subject: paper?.subject || '', questions: questions.length, answered: Object.values(answers).filter(answer => typeof answer === 'string' && answer.trim()).length, knowledgePoints: [...new Set(questions.flatMap(question => question.knowledgePoints || []))], createdAt: item.createdAt, href: `/knowledge-library?paper=${encodeURIComponent(item.paperId)}&attempt=${encodeURIComponent(item.id)}`, preview: questions.slice(0, 3).map(question => question.correctedMarkdown || question.questionText || '') }; }),
  ];
  return NextResponse.json({ items: items.filter(item => (!subject || item.subject === subject) && (!search || [item.title, item.subject, ...item.knowledgePoints, ...item.preview].join(' ').toLocaleLowerCase().includes(search))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 150) });
}
