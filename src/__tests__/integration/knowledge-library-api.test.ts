import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), paper: vi.fn(), alternatives:vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: { knowledgePaper: { findUnique: mocks.paper,findMany:mocks.alternatives } } }));
import { GET } from '@/app/api/knowledge-library/[id]/route';

const fixture = {
    id: 'paper', title: '2025年中考数学', questions: JSON.stringify([
        { number: '1', questionHtml: '<p>七年级题干</p>', answerHtml: '<p>秘密答案一</p>', grade: 7 },
        { number: '2', questionHtml: '<p>九年级题干</p>', answerHtml: '<p>秘密答案二</p>', grade: 9 },
    ]), knowledgeGrades: '[7,9]', attachments: JSON.stringify([{ label: '原卷', url: 'https://example.test/paper.docx', kind: 'paper' }, { label: '答案', url: 'https://example.test/answer.docx', kind: 'answer' }]),
};
beforeEach(() => { mocks.session.mockResolvedValue({ user: { id: 'user' } }); mocks.paper.mockResolvedValue(fixture);mocks.alternatives.mockResolvedValue([]); });
const context = { params: Promise.resolve({ id: 'paper' }) };

describe('knowledge paper answer visibility and grade filtering', () => {
    it('requires authentication', async () => {
        mocks.session.mockResolvedValue(null);
        expect((await GET(new Request('http://localhost/paper'), context)).status).toBe(401);
        expect(mocks.paper).not.toHaveBeenCalled();
    });
    it('omits both answer content and answer attachments by default', async () => {
        const response = await GET(new Request('http://localhost/paper'), context);
        const data = await response.json();
        expect(data.questions.every((question: { answerHtml: string }) => !question.answerHtml)).toBe(true);
        expect(JSON.stringify(data)).not.toContain('秘密答案');
        expect(data.attachments).toHaveLength(1);
    });
    it('returns answers only after explicit reveal', async () => {
        const response = await GET(new Request('http://localhost/paper?answers=1'), context);
        const data = await response.json();
        expect(data.questions[0].answerHtml).toContain('秘密答案一');
        expect(data.attachments).toHaveLength(2);
    });
    it('filters by actual question knowledge grade', async () => {
        const response = await GET(new Request('http://localhost/paper?grade=7'), context);
        const data = await response.json();
        expect(data.questions).toHaveLength(1);
        expect(data.questions[0].grade).toBe(7);
    });
});

it('keeps a whole original sheet visible when a knowledge grade filter is selected',async()=>{mocks.paper.mockResolvedValue({...fixture,questions:JSON.stringify([{number:'整卷',wholePaper:true,grade:null,questionHtml:'<img src="/knowledge-assets/test.png"/>',answerHtml:'秘密答案'}])});const data=await (await GET(new Request('http://localhost/paper?grade=9'),context)).json();expect(data.questions).toHaveLength(1);expect(JSON.stringify(data.questions)).not.toContain('秘密答案');});
