import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), evidence: vi.fn(), evidenceCreate: vi.fn(), tutorGenerate: vi.fn(), tutorCreate: vi.fn(),
  path: vi.fn(), sets: vi.fn(), recordCount: vi.fn(), updatePath: vi.fn(),
  homework: vi.fn(), errors: vi.fn(), attempts: vi.fn(), papers: vi.fn(),
}));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/study-preferences', () => ({ storedStudyPreferences: vi.fn(() => ({})), studyPreferences: vi.fn(() => ({})) }));
vi.mock('@/lib/knowledge-diagnosis', () => ({ diagnosisNodes: vi.fn(() => [{ id: 'node-1', unitId: 'unit-1', subject: '数学', grade: '小学五年级', volume: '上册', chapter: '小数的乘法与除法', term: '小数乘法', meaning: '计算', publisher: '上海教育出版社', textbook: '数学', edition: '第一版', isbn: '978-test', lessonPages: ['1'] }]) }));
vi.mock('@/lib/ai', () => ({ getAIService: vi.fn(() => ({ reanswerQuestion: mocks.tutorGenerate })) }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.user },
  textbookEvidence: { findFirst: mocks.evidence, create: mocks.evidenceCreate },
  sourceTutorNote: { create: mocks.tutorCreate },
  learningPath: { findFirst: mocks.path, updateMany: mocks.updatePath },
  learningSet: { findMany: mocks.sets }, practiceRecord: { count: mocks.recordCount },
  homeworkReview: { findMany: mocks.homework }, errorItem: { findMany: mocks.errors },
  paperAttempt: { findMany: mocks.attempts }, knowledgePaper: { findMany: mocks.papers },
} }));

import { GET as evidenceGet, POST as evidencePost } from '@/app/api/textbook-evidence/route';
import { PATCH as pathPatch } from '@/app/api/learning-paths/route';
import { GET as archiveGet } from '@/app/api/question-archive/route';
import { POST as tutorPost } from '@/app/api/source-tutor/route';

const url = 'http://localhost/api';
const pathState = { current: 1, steps: [
  { nodeId: 'node-1', kind: 'foundation', completedAt: '2026-11-13T00:00:00.000Z' },
  { nodeId: 'node-1', kind: 'example' }, { nodeId: 'node-1', kind: 'practice' }, { nodeId: 'node-1', kind: 'retest' },
] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'student-1' } });
  mocks.user.mockResolvedValue({ id: 'student-1', studyPreferences: '{}' });
  mocks.evidenceCreate.mockResolvedValue({ id: 'evidence-1' });
  mocks.tutorGenerate.mockResolvedValue({ answerText: '讲解内容', analysis: '例子' });
  mocks.tutorCreate.mockResolvedValue({ id: 'note-1' });
  mocks.path.mockResolvedValue({ id: 'path-1', userId: 'student-1', diagnosisSessionId: 'diagnosis-1', state: JSON.stringify(pathState), createdAt: new Date('2026-11-13'), updatedAt: new Date('2026-11-13') });
  mocks.sets.mockResolvedValue([{ id: 'set-1', questions: '[{"questionText":"2×3=?"}]', parameters: JSON.stringify({ subject: '数学', knowledgePoint: '小数乘法' }) }]);
  mocks.recordCount.mockResolvedValue(1);
  mocks.updatePath.mockResolvedValue({ count: 1 });
  mocks.homework.mockResolvedValue([]);
  mocks.errors.mockResolvedValue([]); mocks.attempts.mockResolvedValue([]); mocks.papers.mockResolvedValue([]);
});

it('rejects an old textbook edition before asking AI and saves a current explanation', async () => {
  const ask = () => tutorPost(new Request(`${url}/source-tutor`, { method: 'POST', body: JSON.stringify({ nodeId: 'node-1', evidenceId: 'evidence-1', action: 'explain' }) }));
  mocks.evidence.mockResolvedValueOnce({ id: 'evidence-1', excerpt: '小数乘法原文', sourceSnapshot: '{"edition":"旧版"}' });
  expect((await ask()).status).toBe(409);
  expect(mocks.tutorGenerate).not.toHaveBeenCalled();
  mocks.evidence.mockResolvedValueOnce({ id: 'evidence-1', excerpt: '小数乘法原文', page: '12', verified: true, sourceSnapshot: '{"edition":"第一版"}' });
  expect((await ask()).status).toBe(200);
  expect(mocks.tutorCreate.mock.calls[0][0].data.sourceSnapshot).toContain('第一版');
});

it('stores textbook provenance and protects the photo from another account', async () => {
  const response = await evidencePost(new Request(`${url}/textbook-evidence`, { method: 'POST', body: JSON.stringify({ nodeId: 'node-1', page: '12', excerpt: '小数乘法原文', verified: true }) }));
  expect(response.status).toBe(200);
  expect(mocks.evidenceCreate.mock.calls[0][0].data.sourceSnapshot).toContain('上海教育出版社');
  mocks.evidence.mockResolvedValue(null);
  expect((await evidenceGet(new Request(`${url}/textbook-evidence?image=someone-elses-photo`))).status).toBe(404);
  expect(mocks.evidence.mock.calls[0][0].where.userId).toBe('student-1');
});

it('checks the matched set even when the path page does not send a set ID', async () => {
  const response = await pathPatch(new Request(`${url}/learning-paths`, { method: 'PATCH', body: JSON.stringify({ id: 'path-1', index: 1 }) }));
  expect(response.status).toBe(200);
  expect(mocks.recordCount.mock.calls[0][0].where.learningSetId).toBe('set-1');
  expect(mocks.updatePath).toHaveBeenCalledOnce();
});

it('archives all photographed questions and links to the exact paper attempt', async () => {
  mocks.sets.mockResolvedValue([]);
  mocks.homework.mockResolvedValue([{ id: 'homework-1', userId: 'student-1', createdAt: new Date('2026-11-13'), questions: '[]', scanQuestions: JSON.stringify([{ subject: '数学', questionText: '第一题', knowledgePoints: ['计算'], judgement: 'correct' }, { subject: '数学', questionText: '第二题', knowledgePoints: ['计算'], judgement: 'wrong' }]) }]);
  mocks.attempts.mockResolvedValue([{ id: 'attempt-1', paperId: 'paper-1', answers: '{"1":"A"}', createdAt: new Date('2026-11-13') }]);
  mocks.papers.mockResolvedValue([{ id: 'paper-1', title: '模拟卷', subject: '数学', questions: '[{"questionText":"题目"}]' }]);
  const body = await (await archiveGet(new Request(`${url}/question-archive`))).json();
  expect(body.items.find((item: { source: string }) => item.source === '拍照作业').questions).toBe(2);
  expect(body.items.find((item: { source: string }) => item.source === '试卷').href).toContain('attempt=attempt-1');
});
