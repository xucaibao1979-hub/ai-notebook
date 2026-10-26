import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), createRevision: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser, updateMany: mocks.updateUser }, studyCatalogRevision: { create: mocks.createRevision }, $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { updateMany: mocks.updateUser }, studyCatalogRevision: { create: mocks.createRevision } }) } }));

import { DELETE, GET, PATCH, POST, PUT } from '@/app/api/study-units/route';

const unit = { id: 'unit-1', subject: '英语', grade: '小学五年级', textbook: '新版教材', title: 'Unit 8', entries: [{ term: 'useful', meaning: '有用的', mastered: false }] };
const user = { id: 'child-a', currentGrade: 5, educationStage: 'primary', enrollmentYear: null, studyPreferences: JSON.stringify({ studyUnits: [unit] }) };

describe('study units', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'child-a' } }); mocks.findUser.mockResolvedValue(user); mocks.updateUser.mockResolvedValue({ count: 1 }); });
    it('requires a signed-in learner', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect(mocks.findUser).not.toHaveBeenCalled();
    });
    it('reads only the active learner profile', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(mocks.findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'child-a' } }));
        expect((await response.json()).units[0].title).toBe('Unit 8');
    });
    it('adds a unit and preserves existing units with compare-and-swap', async () => {
        const response = await POST(new Request('http://localhost/api/study-units', { method: 'POST', body: JSON.stringify({ subject: '英语', grade: '小学五年级', textbook: '新版教材', title: 'Unit 9', entries: [{ term: 'robot', meaning: '机器人' }] }) }));
        expect(response.status).toBe(200);
        const call = mocks.updateUser.mock.calls[0][0];
        expect(call.where).toEqual({ id: 'child-a', studyPreferences: user.studyPreferences });
        expect(JSON.parse(call.data.studyPreferences).studyUnits).toHaveLength(2);
        expect(mocks.createRevision).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'child-a', snapshot: user.studyPreferences }) });
    });
    it('keeps publisher and volume and permits the same unit title in another volume', async () => {
        const response = await POST(new Request('http://localhost/api/study-units', { method: 'POST', body: JSON.stringify({ subject: '英语', grade: '小学五年级', publisher: '人民教育出版社', textbook: '新版教材', volume: '下册', title: 'Unit 8', entries: [{ term: 'robot', meaning: '机器人' }] }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences).studyUnits.at(-1);
        expect(saved).toMatchObject({ publisher: '人民教育出版社', volume: '下册', title: 'Unit 8' });
    });
    it('stores words, phrases and sentences while preserving old untyped entries', async () => {
        const response = await POST(new Request('http://localhost/api/study-units', { method: 'POST', body: JSON.stringify({ subject: '英语', grade: '小学五年级', textbook: '新版教材', title: 'Unit 9', entries: [{ kind: '单词', term: 'useful', meaning: '有用的' }, { kind: '短语', term: 'take photos', meaning: '拍照' }, { kind: '句子', term: 'A pencil is useful in class.', meaning: '铅笔在课堂上很有用。' }] }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences).studyUnits;
        expect(saved.at(-1).entries.map((entry: { kind: string }) => entry.kind)).toEqual(['单词', '短语', '句子']);
        expect(saved[0].entries[0].kind).toBe('知识点');
    });
    it('stores a table of contents with lesson titles and pages before learning notes exist', async () => {
        const response = await POST(new Request('http://localhost/api/study-units', { method: 'POST', body: JSON.stringify({ subject: '语文', grade: '小学五年级', publisher: '人民教育出版社', textbook: '统编版', volume: '上册', title: '第一单元 · 阅读', lessons: [{ title: '桂花雨', page: '1' }, { title: '落花生', page: '3' }], entries: [] }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences).studyUnits.at(-1);
        expect(saved.lessons).toEqual([{ title: '桂花雨', page: '1' }, { title: '落花生', page: '3' }]);
        expect(saved.entries).toEqual([]);
    });
    it('updates one mastery entry without changing others', async () => {
        const response = await PATCH(new Request('http://localhost/api/study-units', { method: 'PATCH', body: JSON.stringify({ id: 'unit-1', entryIndex: 0, mastered: true }) }));
        expect(response.status).toBe(200);
        expect(JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences).studyUnits[0].entries[0].mastered).toBe(true);
    });
    it('edits an existing unit under the active learner', async () => {
        const response = await PUT(new Request('http://localhost/api/study-units', { method: 'PUT', body: JSON.stringify({ ...unit, title: 'Unit 8 revised' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences).studyUnits;
        expect(saved[0].title).toBe('Unit 8 revised');
        expect(saved).toHaveLength(1);
    });
    it('rejects another learner unit id', async () => {
        const response = await DELETE(new Request('http://localhost/api/study-units?id=other-child-unit', { method: 'DELETE' }));
        expect(response.status).toBe(404);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
});
