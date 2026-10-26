import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn(), generate: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ generateCatalogDraft: mocks.generate }) }));

import { POST } from '@/app/api/study-catalog/suggest-grade/route';
import { shanghaiMathFiveFour2026 } from '@/lib/verified-textbook-catalog';

describe('photographed math textbook catalog endpoint', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.session.mockResolvedValue({ user: { id: 'student-a' } });
        mocks.findUser.mockResolvedValue({ studyPreferences: JSON.stringify({ studyRegions: ['上海'], studyPublisherNodes: [{ region: '上海', name: '上海教育出版社' }], studySubjectNodes: [{ region: '上海', publisher: '上海教育出版社', name: '数学' }] }) });
    });
    it('uses the photographed nine contents and never calls AI for the exact upper-volume ISBN', async () => {
        const response = await POST(new Request('http://localhost/api/study-catalog/suggest-grade', { method: 'POST', body: JSON.stringify({ ...shanghaiMathFiveFour2026, volume: '上册' }) }));
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(result.verification).toBe('user-photo');
        expect(result.units).toHaveLength(9);
        expect(result.units[0].lessons[0].page).toBe('1');
        expect(mocks.generate).not.toHaveBeenCalled();
    });
    it('uses the photographed catalog when optional book metadata is blank', async () => {
        const response = await POST(new Request('http://localhost/api/study-catalog/suggest-grade', { method: 'POST', body: JSON.stringify({ region: '上海', publisher: '上海教育出版社', subject: '数学', grade: '小学五年级', volume: '上册' }) }));
        const result = await response.json();
        expect(response.status).toBe(200);
        expect(result.verification).toBe('user-photo');
        expect(result.scope.isbn).toBe(shanghaiMathFiveFour2026.isbn);
        expect(result.units.map((unit: { title: string }) => unit.title)).toEqual(['小数的乘法与除法', '小数的应用', '平均数', '制订旅行方案', '面积的计算', '课间体育活动', '因数与倍数', '数学广场', '复习']);
        expect(mocks.generate).not.toHaveBeenCalled();
    });
});
