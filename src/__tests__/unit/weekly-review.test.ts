import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/error-solution',()=>({prepareErrorSolution:vi.fn(async()=>({answerText:'正确答案',analysis:'先确认条件，再逐步求解'}))}));
import { calculateWeakPoints, weeklyWindow, WeeklyItem } from '@/lib/weekly-analysis';

const mocks = vi.hoisted(() => ({
    notebook: vi.fn(), items: vi.fn(), report: vi.fn(), upsertReport: vi.fn(), claim: vi.fn(), update: vi.fn(), findOwned: vi.fn(), current: vi.fn(),
    createSet: vi.fn(), transaction: vi.fn(), diagnose: vi.fn(), generate: vi.fn(), config: vi.fn(), activeConfig: vi.fn(), profile: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
    user: { findUnique: mocks.profile },
    subject: { findFirst: mocks.notebook }, errorItem: { findMany: mocks.items },
    weeklyReport: { findUnique: mocks.report, upsert: mocks.upsertReport, updateMany: mocks.claim, update: mocks.update, findUniqueOrThrow: mocks.current },
    $transaction: mocks.transaction,
} }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ reanswerQuestion: mocks.diagnose, generateSimilarQuestion: mocks.generate }) }));
vi.mock('@/lib/config', () => ({ getAppConfig: mocks.config, getActiveOpenAIConfig: mocks.activeConfig }));
import { analyzeWeek } from '@/lib/weekly-report-service';

function item(id: string, masteryLevel = 0, tags = ['一元一次方程']): WeeklyItem { return { id, questionText: '求解 x+1=3', masteryLevel, mistakeAnalysis: '移项符号错误', errorType: '计算失误', knowledgePoints: null, subject: { name: '数学' }, tags: tags.map(name => ({ name })), gradeSemester: '初一' }; }
beforeEach(() => {
    mocks.profile.mockResolvedValue({ currentGrade: 8 });
    mocks.notebook.mockResolvedValue({ id: 'book' }); mocks.items.mockResolvedValue([item('error')]);
    mocks.report.mockResolvedValue(null); mocks.upsertReport.mockResolvedValue({ id: 'report' }); mocks.claim.mockResolvedValue({ count: 1 });
    mocks.update.mockImplementation(async args => ({ id: 'report', ...args.data }));
    mocks.config.mockReturnValue({ aiProvider: 'gemini', gemini: {} });
    mocks.diagnose.mockImplementation(async(prompt:string)=>prompt.includes('质量审核员')?{answerText:'{"valid":true,"reason":"通过"}',analysis:'独立解题'}:{ answerText: '方程求解有待巩固', analysis: '应重视移项符号' });
    mocks.generate.mockResolvedValue({ questionText: '求解 x+2=5', answerText: 'x=3', analysis: '移项得到3' });
    mocks.createSet.mockResolvedValue({ id: 'weekly-set' }); mocks.findOwned.mockResolvedValue({ id: 'report' }); mocks.current.mockResolvedValue({ id: 'report', status: 'analyzing' });
    mocks.transaction.mockImplementation(async callback => callback({ learningSet: { create: mocks.createSet }, weeklyReport: { findFirst: mocks.findOwned, findUniqueOrThrow: mocks.current, update: mocks.update } }));
});

describe('weekly window and weakness ranking', () => {
    it('starts a new calendar week at Monday midnight in Shanghai', () => {
        expect(weeklyWindow(new Date('2026-10-11T15:59:59Z')).weekKey).toBe('2026-10-05');
        expect(weeklyWindow(new Date('2026-10-11T16:00:00Z')).weekKey).toBe('2026-10-12');
        const window = weeklyWindow(new Date('2026-10-09T03:00:00Z'));
        expect(window.periodEnd.getTime() - window.periodStart.getTime()).toBe(7 * 86400000);
    });
    it('ranks frequent unmastered points above mastered points and deduplicates item tags', () => {
        const stats = calculateWeakPoints([item('a', 0, ['移项', '移项']), item('b', 1, ['移项']), item('c', 2, ['几何'])]);
        expect(stats.total).toBe(3); expect(stats.unmastered).toBe(2);
        expect(stats.weakPoints[0]).toMatchObject({ name: '移项', count: 2, unmastered: 2, score: 5 });
    });
    it('supports legacy tags and malformed legacy data without fabricating points', () => {
        const legacy = { ...item('a', 0, []), knowledgePoints: '["英语时态"]', subject: { name: '英语' } };
        expect(calculateWeakPoints([legacy]).weakPoints[0].name).toBe('英语时态');
        expect(calculateWeakPoints([{ ...legacy, knowledgePoints: 'invalid' }]).weakPoints[0].name).toBe('英语综合基础');
    });
});

describe('weekly generation and persistence', () => {
    it('rejects another users notebook before reading questions', async () => {
        mocks.notebook.mockResolvedValue(null);
        await expect(analyzeWeek('user', 'foreign')).rejects.toThrow('无权访问');
        expect(mocks.items).not.toHaveBeenCalled();
    });
    it('filters only this users newly created errors from the most recent seven days', async () => {
        await analyzeWeek('user', 'book');
        expect(mocks.items.mock.calls[0][0].where).toMatchObject({ userId: 'user', subjectId: 'book', createdAt: { gte: expect.any(Date), lt: expect.any(Date) } });
    });
    it('keeps useful statistics without calling AI when no API key is configured', async () => {
        const result = await analyzeWeek('user', 'book');
        expect(result.status).toBe('awaiting_ai'); expect(JSON.parse(result.statistics).total).toBe(1);
        expect(mocks.diagnose).not.toHaveBeenCalled(); expect(mocks.createSet).not.toHaveBeenCalled();
    });
    it('does not repeat completed reports during automated hourly checks', async () => {
        const saved = { id: 'saved', status: 'ready', statistics: '{"grade":8}' }; mocks.report.mockResolvedValue(saved);
        expect(await analyzeWeek('user', 'book')).toBe(saved);
        expect(mocks.items).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled();
    });
    it('does not issue another AI call when another worker owns the report lease', async () => {
        mocks.claim.mockResolvedValue({ count: 0 });
        await analyzeWeek('user', 'book'); expect(mocks.diagnose).not.toHaveBeenCalled();
    });
    it('generates a linked exercise set using actual weak points and their source errors', async () => {
        mocks.config.mockReturnValue({ aiProvider: 'gemini', gemini: { apiKey: 'test-key' } });
        const result = await analyzeWeek('user', 'book');
        expect(result.status).toBe('ready'); expect(result.exerciseSetId).toBe('weekly-set');
        expect(mocks.generate.mock.calls[0][0]).toContain('一元一次方程');
        expect(mocks.generate.mock.calls[0][0]).toContain('x+1=3');
        expect(mocks.generate.mock.calls[0][4]).toBe('初二');
        expect(mocks.createSet.mock.calls[0][0].data.userId).toBe('user');
        expect(JSON.parse(mocks.createSet.mock.calls[0][0].data.questions)[0].provenance.originalId).toBe('error');
    });
    it('returns current statistics before the slower AI report finishes',async()=>{mocks.config.mockReturnValue({aiProvider:'gemini',gemini:{apiKey:'test-key'}});let resolveDiagnosis!:(value:object)=>void;mocks.diagnose.mockImplementation((prompt:string)=>prompt.includes('质量审核员')?Promise.resolve({answerText:'{"valid":true,"reason":"通过"}',analysis:'独立解题'}):new Promise(resolve=>{resolveDiagnosis=resolve;}));const initial=await analyzeWeek('user','book',true,true);expect(initial.status).toBe('analyzing');expect(mocks.claim.mock.calls[0][0].data.statistics).toContain('一元一次方程');resolveDiagnosis({answerText:'建议',analysis:'复习移项'});for(let i=0;i<20&&!mocks.createSet.mock.calls.length;i++)await Promise.resolve();});
    it('does not create stale duplicate exercises after losing the database lease', async () => {
        mocks.config.mockReturnValue({ aiProvider: 'gemini', gemini: { apiKey: 'test-key' } }); mocks.findOwned.mockResolvedValue(null);
        await analyzeWeek('user', 'book'); expect(mocks.createSet).not.toHaveBeenCalled();
    });
    it('records an empty week without spending AI calls', async () => {
        mocks.items.mockResolvedValue([]); const result = await analyzeWeek('user', 'book');
        expect(result.status).toBe('empty'); expect(mocks.diagnose).not.toHaveBeenCalled();
    });
});
