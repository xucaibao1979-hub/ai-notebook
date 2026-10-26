import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), paper: vi.fn(), update: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { knowledgePaper: { findUnique: mocks.paper, updateMany: mocks.update } } }));
import { POST } from '@/app/api/knowledge-library/[id]/review/route';
const context = { params: Promise.resolve({ id: 'paper' }) };
function request(body: object) { return new Request('http://localhost/review', { method: 'POST', body: JSON.stringify(body) }); }
beforeEach(() => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.paper.mockResolvedValue({ id: 'paper', questions: JSON.stringify([{ number: '1', questionHtml: '<p>原题与答案提示</p>', answerHtml: '<p>答案</p>', answerLeakRisk: true }]) });
    mocks.update.mockResolvedValue({ count: 1 });
});
describe('local paper correction', () => {
    it('requires administrator access', async () => {
        mocks.session.mockResolvedValue({ user: { id: 'user', role: 'user' } });
        expect((await POST(request({ number: '1', markdown: '题干' }), context)).status).toBe(403);
        expect(mocks.update).not.toHaveBeenCalled();
    });
    it('preserves original content and records local correction without changing the answer', async () => {
        const response = await POST(request({ number: '1', markdown: '完整题干，求解 $x+1=3$。' }), context);
        expect(response.status).toBe(200);
        const updated = JSON.parse(mocks.update.mock.calls[0][0].data.questions)[0];
        expect(updated.originalQuestionHtml).toBe('<p>原题与答案提示</p>');
        expect(updated.correctedMarkdown).toContain('$x+1=3$');
        expect(updated.answerHtml).toBe('<p>答案</p>');
        expect(updated.locallyReviewed).toBe(true);
        expect(updated.reviewedBy).toBe('admin');
    });
    it('rejects a stale overwrite', async () => {
        mocks.update.mockResolvedValue({ count: 0 });
        expect((await POST(request({ number: '1', markdown: '题干' }), context)).status).toBe(409);
    });
    it('rejects an empty correction and an unknown question', async () => {
        expect((await POST(request({ number: '1', markdown: '' }), context)).status).toBe(400);
        expect((await POST(request({ number: 'missing', markdown: '题干' }), context)).status).toBe(404);
    });
});
