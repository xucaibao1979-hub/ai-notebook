import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    session: vi.fn(),
    findCards: vi.fn(),
    findError: vi.fn(),
    updateCards: vi.fn(),
}));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {
    knowledgeCard: { findMany: mocks.findCards, updateMany: mocks.updateCards },
    errorItem: { findFirst: mocks.findError },
} }));

import { GET, POST, PATCH } from '@/app/api/knowledge-cards/route';

describe('knowledge cards identity boundary', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'child-a' } }); });
    it('lists only current child cards and hides archived error links', async () => {
        mocks.findCards.mockResolvedValue([{ id: 'card', errors: [
            { errorItemId: 'active', errorItem: { archivedAt: null } },
            { errorItemId: 'removed', errorItem: { archivedAt: new Date() } },
        ] }]);
        const response = await GET(new Request('http://localhost/api/knowledge-cards?errorItemId=active'));
        expect(response.status).toBe(200);
        expect(mocks.findCards).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'child-a', errors: { some: { errorItemId: 'active' } } } }));
        expect((await response.json())[0].errors).toHaveLength(1);
    });
    it('cannot collect another child error', async () => {
        mocks.findError.mockResolvedValue(null);
        const response = await POST(new Request('http://localhost/api/knowledge-cards', { method: 'POST', body: JSON.stringify({ errorItemId: 'other-child-error', title: '分数', subject: '数学' }) }));
        expect(response.status).toBe(404);
        expect(mocks.findError).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'child-a' }) }));
    });
    it('updates only cards owned by current child', async () => {
        mocks.updateCards.mockResolvedValue({ count: 0 });
        const response = await PATCH(new Request('http://localhost/api/knowledge-cards', { method: 'PATCH', body: JSON.stringify({ id: 'other-child-card', status: 'mastered' }) }));
        expect(response.status).toBe(404);
        expect(mocks.updateCards).toHaveBeenCalledWith({ where: { id: 'other-child-card', userId: 'child-a' }, data: { status: 'mastered' } });
    });
});
