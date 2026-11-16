import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    session: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(),
}));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { toolPracticeSession: {
    findUnique: mocks.findUnique, findFirst: mocks.findFirst, create: mocks.create, updateMany: mocks.updateMany,
} } }));
import { GET, POST, PUT } from '@/app/api/tools/practice-session/route';

const url = 'http://localhost/api/tools/practice-session';
const row = { userId: 'alice', kind: 'mental-math', revision: 1, settings: JSON.stringify({ mode: 'mixed', difficulty: 'basic', count: 1 }), questions: JSON.stringify([{ id: 1, prompt: '1 + 1', answer: 2 }]), answers: '{}', submitted: false };
const call = (method: 'POST' | 'PUT', data: unknown) => (method === 'POST' ? POST : PUT)(new Request(url, { method, body: JSON.stringify(data) }));

describe('工具练习持久化', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'alice' } });
        mocks.findUnique.mockResolvedValue(row);
        mocks.findFirst.mockResolvedValue({ ...row, revision: 2 });
        mocks.create.mockImplementation(async ({ data }) => ({ ...row, ...data }));
        mocks.updateMany.mockResolvedValue({ count: 1 });
    });
    it('未登录拒绝所有读写', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET(new Request(`${url}?kind=mental-math`))).status).toBe(401);
        expect((await call('POST', {})).status).toBe(401);
        expect((await call('PUT', {})).status).toBe(401);
        expect(mocks.findUnique).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });
    it('GET 仅按 session 用户和类型查询，无缓存', async () => {
        const response = await GET(new Request(`${url}?kind=mental-math`));
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(mocks.findUnique).toHaveBeenCalledWith({ where: { userId_kind: { userId: 'alice', kind: 'mental-math' } } });
        expect((await response.json()).questions).toEqual([{ id: 1, prompt: '1 + 1', answer: 2 }]);
        mocks.findUnique.mockResolvedValueOnce(null);
        expect(await (await GET(new Request(`${url}?kind=applied-math`))).json()).toBeNull();
        expect((await GET(new Request(`${url}?kind=mental-math&kind=applied-math`))).status).toBe(400);
    });
    it('POST 服务端生成题目，拒绝客户端题目和非法知识点', async () => {
        const payload = { kind: 'mental-math', revision: null, settings: { mode: 'mixed', difficulty: 'basic', count: 1 } };
        expect((await call('POST', { ...payload, questions: row.questions })).status).toBe(400);
        expect((await call('POST', { kind: 'applied-math', revision: null, settings: { grade: 1, topic: 'ratio', count: 1 } })).status).toBe(400);
        const response = await call('POST', payload);
        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'alice', kind: 'mental-math', submitted: false, answers: '{}' }) });
        expect(JSON.parse(mocks.create.mock.calls[0][0].data.questions)).toHaveLength(1);
    });
    it('PUT 原子版本更新，只能编辑已有题目答案，不接受客户端成绩', async () => {
        expect((await call('PUT', { kind: 'mental-math', revision: 1, answers: { 1: '2' }, submitted: true, score: 1 })).status).toBe(400);
        expect((await call('PUT', { kind: 'mental-math', revision: 1, answers: { 2: '2' }, submitted: true })).status).toBe(400);
        await call('PUT', { kind: 'mental-math', revision: 1, answers: { 1: '2' }, submitted: true });
        expect(mocks.updateMany).toHaveBeenCalledWith({ where: { userId: 'alice', kind: 'mental-math', revision: 1, submitted: false }, data: { answers: '{"1":"2"}', submitted: true, revision: { increment: 1 } } });
        mocks.updateMany.mockResolvedValueOnce({ count: 0 });
        expect((await call('PUT', { kind: 'mental-math', revision: 1, answers: {}, submitted: false })).status).toBe(409);
    });
    it('旧版本与已提交练习不可覆盖，POST 也须匹配版本', async () => {
        expect((await call('POST', { kind: 'mental-math', revision: 0, settings: { mode: 'mixed', difficulty: 'basic', count: 1 } })).status).toBe(400);
        expect((await call('PUT', { kind: 'mental-math', revision: 2, answers: {}, submitted: false })).status).toBe(409);
        mocks.findUnique.mockResolvedValue({ ...row, submitted: true });
        expect((await call('PUT', { kind: 'mental-math', revision: 1, answers: {}, submitted: false })).status).toBe(409);
    });
    it('拒绝无效 JSON、过大载荷和数据库异常不泄漏详情', async () => {
        expect((await POST(new Request(url, { method: 'POST', body: '{' }))).status).toBe(400);
        expect((await POST(new Request(url, { method: 'POST', body: 'x'.repeat(17_000) }))).status).toBe(413);
        mocks.findUnique.mockRejectedValueOnce(new Error('private-db-secret'));
        const response = await GET(new Request(`${url}?kind=mental-math`));
        expect(response.status).toBe(503);
        expect(JSON.stringify(await response.json())).not.toContain('private-db-secret');
    });
});
