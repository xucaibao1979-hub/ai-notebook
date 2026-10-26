import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findSet: vi.fn(), findRecord: vi.fn(), upsertRecord: vi.fn(), findUser: vi.fn(), collision: vi.fn(), updateUser: vi.fn(), compare: vi.fn(), hash: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {
    learningSet: { findFirst: mocks.findSet },
    practiceRecord: { findUnique: mocks.findRecord, upsert: mocks.upsertRecord },
    user: { findUnique: mocks.findUser, findFirst: mocks.collision, update: mocks.updateUser },
} }));
vi.mock('bcryptjs', () => ({ compare: mocks.compare, hash: mocks.hash }));
vi.mock('@/lib/ai', () => ({ getAIService: () => { throw new Error('AI_AUTH_ERROR'); } }));

import { POST as answer } from '@/app/api/learning/answer/route';
import { PATCH as account } from '@/app/api/admin/account/route';

function req(body: object) { return new Request('http://localhost/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
const exercise = { questionText: '选出正确答案', options: ['甲', '乙', '丙', '丁'], answerText: 'B. 乙', correctOption: 'B', analysis: '解析', subject: '数学', difficulty: 'medium' };
beforeEach(() => {
    mocks.session.mockResolvedValue({ user: { id: 'current-user', role: 'admin' } });
    mocks.findSet.mockResolvedValue({ id: 'owned-set', questions: JSON.stringify([exercise]) });
    mocks.upsertRecord.mockImplementation(async args => args.create);
    mocks.findUser.mockResolvedValue({ id: 'current-user', role: 'admin', isActive: true, password: 'old-hash' });
    mocks.compare.mockResolvedValue(true); mocks.hash.mockResolvedValue('new-hash'); mocks.collision.mockResolvedValue(null);
});

describe('learning answer ownership and scoring', () => {
    it('requires authentication', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await answer(req({ setId: 'owned-set', index: 0, action: 'submit', userAnswer: 'A' }))).status).toBe(401);
        expect(mocks.findSet).not.toHaveBeenCalled();
    });
    it('rejects access to another users learning set', async () => {
        mocks.findSet.mockResolvedValue(null);
        expect((await answer(req({ setId: 'foreign-set', index: 0, action: 'reveal' }))).status).toBe(404);
        expect(mocks.findSet).toHaveBeenCalledWith({ where: { id: 'foreign-set', userId: 'current-user',archivedAt:null } });
    });
    it('grades against the stored answer instead of the clients isCorrect flag', async () => {
        const response = await answer(req({ setId: 'owned-set', index: 0, action: 'submit', userAnswer: 'A', isCorrect: true }));
        const result = await response.json();
        expect(result.record.isCorrect).toBe(false);
        expect(mocks.upsertRecord).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId_learningSetId_exerciseIndex: { userId: 'current-user', learningSetId: 'owned-set', exerciseIndex: 0 } },
        }));
    });
    it('revealing an answer does not add a practice record', async () => {
        const response = await answer(req({ setId: 'owned-set', index: 0, action: 'reveal' }));
        expect((await response.json()).answerText).toBe('B. 乙');
        expect(mocks.upsertRecord).not.toHaveBeenCalled();
    });
    it('rejects invalid choices rather than scoring them as incorrect', async () => {
        expect((await answer(req({ setId: 'owned-set', index: 0, action: 'submit', userAnswer: 'invalid' }))).status).toBe(400);
        expect(mocks.upsertRecord).not.toHaveBeenCalled();
    });
    it('does not guess correctness for open-ended answers', async () => {
        mocks.findSet.mockResolvedValue({ id: 'owned-set', questions: JSON.stringify([{ ...exercise, options: undefined, correctOption: undefined }]) });
        const response = await answer(req({ setId: 'owned-set', index: 0, action: 'submit', userAnswer: '我的解题思路' }));
        expect((await response.json()).record.isCorrect).toBe(null);
    });
    it('requires a previous submission before self-assessment', async () => {
        mocks.findSet.mockResolvedValue({ id: 'owned-set', questions: JSON.stringify([{ ...exercise, options: undefined, correctOption: undefined }]) });
        mocks.findRecord.mockResolvedValue(null);
        expect((await answer(req({ setId: 'owned-set', index: 0, action: 'assess', userAnswer: '答案', isCorrect: true }))).status).toBe(400);
    });
});

describe('administrator login settings', () => {
    const body = { username: 'new-admin', currentPassword: 'old-password', password: 'new-password' };
    it('rejects a non-administrator based on the database role', async () => {
        mocks.findUser.mockResolvedValue({ role: 'user', isActive: true });
        expect((await account(req(body))).status).toBe(403);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('rejects the incorrect current password', async () => {
        mocks.compare.mockResolvedValue(false);
        expect((await account(req(body))).status).toBe(400);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('protects existing usernames', async () => {
        mocks.collision.mockResolvedValue({ id: 'another-user' });
        expect((await account(req(body))).status).toBe(409);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('updates the same account and hashes the new password without changing its email or data owner', async () => {
        expect((await account(req(body))).status).toBe(200);
        expect(mocks.hash).toHaveBeenCalledWith('new-password', 12);
        expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'current-user' }, data: { username: 'new-admin', password: 'new-hash' } });
    });
    it('preserves the password when only changing the username', async () => {
        expect((await account(req({ username: 'new-admin', currentPassword: 'old-password' }))).status).toBe(200);
        expect(mocks.hash).not.toHaveBeenCalled();
        expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'current-user' }, data: { username: 'new-admin' } });
    });
});
