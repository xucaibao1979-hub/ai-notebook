import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn(), reanswer: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ reanswerQuestion: mocks.reanswer }) }));

import { POST } from '@/app/api/study-catalog/suggest-grade/route';

describe('grade catalog suggestion', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'learner-a' } });
        mocks.findUser.mockResolvedValue({ studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '英语' }] }) });
        const unit = { title: 'Unit 1', lessons: [{ title: 'Clubs', page: '' }], entries: [{ kind: '单词', term: 'club', meaning: '社团' }] };
        mocks.reanswer.mockResolvedValue({ answerText: JSON.stringify({ units: [unit] }) });
    });
    it('requires a verified catalog for the requested volume', async () => {
        const response = await POST(new Request('http://localhost/api/study-catalog/suggest-grade', { method: 'POST', body: JSON.stringify({ region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册' }) }));
        expect(response.status).toBe(422);
        const body = await response.json();
        expect(body.message).toContain('未找到可核对的上册原版目录');
        expect(mocks.reanswer).not.toHaveBeenCalled();
    });
    it('rejects a placeholder unit instead of presenting it as a real catalog', async () => {
        mocks.reanswer.mockResolvedValue({ answerText: JSON.stringify({ units: [{ title: '待核对单元（原版目录未确认）', lessons: [{ title: '请对照教材', page: '' }], entries: [] }] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog/suggest-grade', { method: 'POST', body: JSON.stringify({ region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册' }) }));
        expect(response.status).toBe(422);
        expect((await response.json()).message).toContain('请上传本册目录页或手动录入');
    });
});
