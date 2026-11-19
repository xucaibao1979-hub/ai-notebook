import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findMany: vi.fn(), create: vi.fn(), generate: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { learningSet: { findMany: mocks.findMany, create: mocks.create } } }));
vi.mock('@/lib/learning-service', () => ({ generateExercises: mocks.generate, LearningError: class LearningError extends Error { status = 422; } }));
import { GET, POST } from '@/app/api/formula-practice/route';

const post = (formulaId = '平方差公式') => POST(new Request('http://localhost/api/formula-practice', { method: 'POST', body: JSON.stringify({ formulaId }) }));
const question = (text: string) => ({ questionText: text, answerText: '答案', analysis: '解析', subject: '数学', knowledgePoints: ['平方差公式'], difficulty: 'medium', provenance: { name: 'AI' } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'student-1' } });
  mocks.findMany.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: 'new-set' });
  mocks.generate.mockResolvedValue([question('求解 (x+2)(x-2)')]);
});

it('requires login and rejects unknown formula IDs', async () => {
  mocks.session.mockResolvedValue(null);
  expect((await post()).status).toBe(401);
  mocks.session.mockResolvedValue({ user: { id: 'student-1' } });
  expect((await post('不存在的公式')).status).toBe(404);
  expect(mocks.generate).not.toHaveBeenCalled();
});

it('retries a repeated question and persists only a distinct reviewed question', async () => {
  mocks.findMany.mockResolvedValue([{ questions: JSON.stringify([question('求解 (x+2)(x-2)')]) }]);
  mocks.generate.mockResolvedValueOnce([question('求解 (x+5)(x-5)')]).mockResolvedValueOnce([question('计算图书馆长方形面积的平方差')]);
  const response = await post();
  expect(response.status).toBe(201);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(mocks.generate.mock.calls[0][1].prompt).toContain('不要重复这些已保存题目');
  expect(mocks.create.mock.calls[0][0].data.selectionKey).toContain('formula:平方差公式:');
  expect(JSON.parse(mocks.create.mock.calls[0][0].data.questions)[0].questionText).toContain('图书馆');
});

it('refuses to save when six attempts repeat the historical question shape', async () => {
  mocks.findMany.mockResolvedValue([{ questions: JSON.stringify([question('求解 (x+2)(x-2)')]) }]);
  mocks.generate.mockResolvedValue([question('求解 (x+5)(x-5)')]);
  expect((await post()).status).toBe(409);
  expect(mocks.generate).toHaveBeenCalledTimes(6);
  expect(mocks.create).not.toHaveBeenCalled();
});

it('shows only the selected formulas history for its owner', async () => {
  mocks.findMany.mockResolvedValue([{ id: 'old-set', createdAt: new Date('2026-11-17'), questions: JSON.stringify([question('计算 x²-4')]), parameters: JSON.stringify({ formulaId: '平方差公式', subject: '数学' }), favorited: false }]);
  const data = await (await GET(new Request('http://localhost/api/formula-practice?formulaId=平方差公式'))).json();
  expect(data.items[0].id).toBe('old-set');
  expect(mocks.findMany.mock.calls[0][0].where.userId).toBe('student-1');
});

it('hides unrelated language questions from formula history', async () => {
  mocks.findMany.mockResolvedValue([
    { id: 'wrong', createdAt: new Date(), questions: JSON.stringify([{ ...question('背诵英语单词'), subject: '英语' }]), parameters: JSON.stringify({ formulaId: '平方差公式', subject: '数学' }), favorited: false },
    { id: 'valid', createdAt: new Date(), questions: JSON.stringify([question('计算 (x+2)(x-2)')]), parameters: JSON.stringify({ formulaId: '平方差公式', subject: '数学', variation: 1 }), favorited: true },
  ]);
  const data = await (await GET(new Request('http://localhost/api/formula-practice?formulaId=平方差公式'))).json();
  expect(data.items).toHaveLength(1);
  expect(data.items[0]).toMatchObject({ id: 'valid', variation: 1, favorited: true });
});

it('retries a generated language question before saving a math exercise', async () => {
  mocks.generate.mockResolvedValueOnce([{ ...question('默写英语单词'), subject: '英语' }]).mockResolvedValueOnce([question('计算 (x+3)(x-3)')]);
  expect((await post()).status).toBe(201);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
  expect(mocks.create.mock.calls[0][0].data.questions).toContain('计算 (x+3)(x-3)');
});

it('generates a primary or senior variation within its selected stage and records its source', async () => {
  const primary = await post('小学:圆面积');
  expect(primary.status).toBe(201);
  expect(mocks.generate.mock.calls[0][1].grade).toBe('小学六年级');
  expect(mocks.generate.mock.calls[0][1].prompt).toContain('小学数学');
  expect(mocks.create.mock.calls[0][0].data.selectionKey).toContain('formula:小学:圆面积:');
  expect(JSON.parse(mocks.create.mock.calls[0][0].data.questions)[0].provenance.name).toContain('小学数学公式');
  mocks.create.mockClear();
  mocks.generate.mockClear();
  const senior = await post('高中:正弦定理');
  expect(senior.status).toBe(201);
  expect(mocks.generate.mock.calls[0][1].grade).toBe('高中一年级');
  expect(JSON.parse(mocks.create.mock.calls[0][0].data.questions)[0].provenance.url).toContain('pep.com.cn');
});

it('targets a selected textbook-style variation without claiming a real exam source', async () => {
  const response = await POST(new Request('http://localhost/api/formula-practice', { method: 'POST', body: JSON.stringify({ formulaId: '和的完全平方公式', variation: 2 }) }));
  expect(response.status).toBe(201);
  const prompt = mocks.generate.mock.calls[0][1].prompt as string;
  expect(prompt).toContain('变式 2');
  expect(prompt).toContain('不能声称来自某年某地真题');
  expect(JSON.parse(mocks.create.mock.calls[0][0].data.parameters).variation).toBe(2);
});

it('restores previously saved quick exercises from their prompt after refresh', async () => {
  mocks.findMany.mockResolvedValue([{ id: 'quick-old', createdAt: new Date(), questions: JSON.stringify([question('计算 (x+3)(x-3)')]), parameters: JSON.stringify({ formulaId: '平方差公式', subject: '数学', prompt: '重点考查变式 1 · 正向应用：使用平方差公式' }), favorited: false }]);
  const data = await (await GET(new Request('http://localhost/api/formula-practice?formulaId=平方差公式'))).json();
  expect(data.items[0]).toMatchObject({ id: 'quick-old', variation: 1 });
});
