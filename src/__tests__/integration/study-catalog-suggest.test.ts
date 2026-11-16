import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn(), reanswer: vi.fn(), updateUser: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser, updateMany: mocks.updateUser } } }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ reanswerQuestion: mocks.reanswer }) }));

import { POST } from '@/app/api/study-catalog/suggest/route';

const course = { id: 'course-1', publisher: '人民教育出版社', subject: '语文', grade: '小学五年级', volume: '上册', textbook: '统编版', schoolSystem: '六三学制' };
const request = () => new Request('http://localhost/api/study-catalog/suggest', { method: 'POST', body: JSON.stringify({ courseId: course.id }) });

describe('study catalog suggestion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'learner-a' } });
        mocks.findUser.mockResolvedValue({ studyPreferences: JSON.stringify({ studyCourses: [course] }) });
        mocks.reanswer.mockResolvedValue({ answerText: '{"units":[{"title":"第一单元","lessons":[{"title":"桂花雨","page":""}]}]}', analysis: '待核对' });
    });
    it('refuses to invent a catalog when the exact edition has no verified source', async () => {
        const response = await POST(request());
        expect(response.status).toBe(422);
        const body = await response.json();
        expect(body.message).toContain('没有可核对的本册原版目录');
        expect(mocks.reanswer).not.toHaveBeenCalled();
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('rejects another user without invoking AI', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await POST(request())).status).toBe(401);
        expect(mocks.reanswer).not.toHaveBeenCalled();
    });
});
