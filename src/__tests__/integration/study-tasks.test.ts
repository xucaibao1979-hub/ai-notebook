import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), generate: vi.fn(), publicSet: vi.fn(), rows: new Map<string, Record<string, unknown>>() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/learning-service', () => ({ getOrCreateLearningSet: mocks.generate, learningSetForClient: mocks.publicSet, LearningError: class LearningError extends Error {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { studyTask: {
    findFirst: vi.fn(async ({ where }: { where: { id?: string; userId: string; status?: { in: string[] } } }) => [...mocks.rows.values()].find(row => (!where.id || row.id === where.id) && row.userId === where.userId && (!where.status || where.status.in.includes(String(row.status)))) || null),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => mocks.rows.get(where.id) || null),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => mocks.rows.get(where.id)),
    findMany: vi.fn(async () => [...mocks.rows.values()]),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: 'task-1', status: 'pending', result: null, error: null, createdAt: new Date(), updatedAt: new Date() }; mocks.rows.set('task-1', row); return row; }),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string; status?: string }; data: Record<string, unknown> }) => { const row = mocks.rows.get(where.id); if (!row || where.status && row.status !== where.status) return { count: 0 }; Object.assign(row, data, { updatedAt: new Date() }); return { count: 1 }; }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const row = mocks.rows.get(where.id)!; Object.assign(row, data, { updatedAt: new Date() }); return row; }),
} } }));

import { GET, POST } from '@/app/api/study-tasks/route';

beforeEach(() => { vi.clearAllMocks(); mocks.rows.clear(); mocks.session.mockResolvedValue({ user: { id: 'student-1' } }); mocks.generate.mockResolvedValue({ id: 'set-1' }); mocks.publicSet.mockReturnValue({ id: 'set-1', questions: [] }); });

it('requires login before reading or starting a task', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost/api/study-tasks'))).status).toBe(401);
    expect((await POST(new Request('http://localhost/api/study-tasks', { method: 'POST', body: '{}' }))).status).toBe(401);
});

it('persists an exercise task and exposes its completed result to its owner', async () => {
    const response = await POST(new Request('http://localhost/api/study-tasks', { method: 'POST', body: JSON.stringify({ kind: 'exercise', request: { mode: 'ai', source: 'ai', subject: '数学', count: 3 } }) }));
    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(mocks.rows.get('task-1')?.status).toBe('succeeded'));
    const saved = await (await GET(new Request('http://localhost/api/study-tasks?id=task-1'))).json();
    expect(saved.result).toEqual({ id: 'set-1', questions: [] });
    expect(saved).not.toHaveProperty('input');
    mocks.session.mockResolvedValue({ user: { id: 'student-2' } });
    expect((await GET(new Request('http://localhost/api/study-tasks?id=task-1'))).status).toBe(404);
});
