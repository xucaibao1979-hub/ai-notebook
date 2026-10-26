import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/error-solution',()=>({prepareErrorSolution:vi.fn(async()=>({answerText:'正确答案',analysis:'先确认条件，再逐步求解'}))}));
import { learningDateKey, learningRequestSchema, buildLearningBrief } from '@/lib/learning';
import { parseQuestionCsv } from '@/lib/public-question-bank';

const mocks = vi.hoisted(() => ({
    findUser: vi.fn(), findNotebook: vi.fn(), findErrors: vi.fn(),
    findSet: vi.fn(), findHistory:vi.fn(), upsertSet: vi.fn(), createSet: vi.fn(),
    review:vi.fn(),ai: vi.fn(), publicBank: vi.fn(), getAI: vi.fn(), papers: vi.fn(), findPaper: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {
    user: { findUnique: mocks.findUser }, subject: { findFirst: mocks.findNotebook }, errorItem: { findMany: mocks.findErrors },
    knowledgePaper: { findMany: mocks.papers, findUnique: mocks.findPaper },
    learningSet: { findUnique: mocks.findSet, findFirst:mocks.findHistory, upsert: mocks.upsertSet, create: mocks.createSet },
} }));
vi.mock('@/lib/ai', () => ({ getAIService: mocks.getAI }));
vi.mock('@/lib/public-question-bank', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/public-question-bank')>();
    return { ...actual, loadPublicQuestions: mocks.publicBank };
});
import { generateExercises, getOrCreateLearningSet, learningSetForClient } from '@/lib/learning-service';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUser.mockResolvedValue({ currentGrade: 12, educationStage: 'senior_high', enrollmentYear: 2024 });
    mocks.papers.mockResolvedValue([]);
    mocks.findPaper.mockResolvedValue(null);
    mocks.publicBank.mockResolvedValue([]);
    mocks.getAI.mockReturnValue({ generateSimilarQuestion: mocks.ai, reanswerQuestion:mocks.review });
    let serial=0;
    mocks.ai.mockImplementation(async()=>({ questionText: '一道新题 '+(++serial), answerText: '标准答案', analysis: '详细解析', knowledgePoints: [] }));
    mocks.review.mockResolvedValue({answerText:JSON.stringify({valid:true,reason:'审核通过'}),analysis:'独立解题'});
});

describe('learning requests and source parsing', () => {
    it('uses Shanghai calendar boundaries for daily sets', () => {
        expect(learningDateKey(new Date('2026-10-08T15:59:59Z'))).toBe('2026-10-08');
        expect(learningDateKey(new Date('2026-10-08T16:00:00Z'))).toBe('2026-10-09');
    });
    it('rejects unsupported source combinations and unbounded generation', () => {
        expect(learningRequestSchema.safeParse({ mode: 'daily', source: 'ai' }).success).toBe(false);
        expect(learningRequestSchema.safeParse({ mode: 'ai', source: 'ai', subject: '数学', count: 99 }).success).toBe(false);
    });
    it('parses multiline, comma-containing and escaped-quote CSV questions', () => {
        const rows = parseQuestionCsv(',Question,A,B,C,D,Answer\r\n1,"第一行,内容\n第二行""引用""",甲,乙,丙,丁,B\r\n');
        expect(rows).toEqual([{ '': '1', Question: '第一行,内容\n第二行"引用"', A: '甲', B: '乙', C: '丙', D: '丁', Answer: 'B' }]);
    });
    it('passes subject, grade and user requirements into the generation brief', () => {
        const request = learningRequestSchema.parse({ mode: 'ai', source: 'ai', subject: '历史', grade: '初二', prompt: '考察时间线', knowledgePoint: '唐朝' });
        expect(buildLearningBrief(request, '唐朝', '概念辨析')).toContain('历史');
        expect(buildLearningBrief(request, '唐朝', '概念辨析')).toContain('考察时间线');
        expect(buildLearningBrief(request, '唐朝', '概念辨析')).toContain('初二');
    });
});

describe('generation and daily persistence', () => {
    it('uses the current grade instead of an old source question grade', async () => {
        mocks.findUser.mockResolvedValue({ currentGrade: 8 });
        mocks.findErrors.mockResolvedValue([{ masteryLevel:0,createdAt:new Date(),reviewSchedules:[], id: 'old', questionText: '原题', gradeSemester: '初三', subject: { name: '数学' }, tags: [] }]);
        await generateExercises('user', learningRequestSchema.parse({ mode: 'daily', source: 'notebook', count: 1 }));
        expect(mocks.ai.mock.calls[0][4]).toBe('初二');
    });
    it('starts daily notebook questions in parallel without re-solving source mistakes',async()=>{
        mocks.findErrors.mockResolvedValue([1,2,3].map(i=>({masteryLevel:0,createdAt:new Date(),reviewSchedules:[],id:String(i),questionText:`原题 ${i}`,gradeSemester:'小学五年级',subject:{name:'数学'},tags:[{name:`知识点 ${i}`}]})));
        const resolvers:((value:object)=>void)[]=[];
        mocks.ai.mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)));
        const pending=generateExercises('user',learningRequestSchema.parse({mode:'daily',source:'notebook',count:3}));
        for(let i=0;i<20&&resolvers.length<3;i++)await Promise.resolve();
        expect(resolvers).toHaveLength(3);
        expect(mocks.ai.mock.calls.every(call=>call[0].includes('知识点'))).toBe(true);
        resolvers.forEach((resolve,index)=>resolve({questionText:`新题 ${index}`,answerText:'答案',analysis:'解析',knowledgePoints:[]}));
        expect(await pending).toHaveLength(3);
    });
    it('does not recommend unlabelled or higher-grade network questions to younger students', async () => {
        mocks.findUser.mockResolvedValue({ currentGrade: 7 });
        mocks.publicBank.mockResolvedValue([1,2].map(i=>({questionText:`七年级基础题 ${i}`,answerText:'A',analysis:'解析',subject:'数学',knowledgePoints:['方程'],provenance:{name:'公开题库',url:'https://example.test'}})));
        mocks.papers.mockResolvedValue([{ title: '中考数学', subject: '数学', sourceUrl: 'https://example.test', questions: JSON.stringify([
            { number: '1', grade: 7, questionHtml: '<p>方程</p>', answerHtml: '<p>答案</p>', knowledgePoints: ['方程'] },
            { number: '2', grade: 9, questionHtml: '<p>二次函数</p>', answerHtml: '<p>答案</p>', knowledgePoints: [] },
            { number: '3', grade: null, questionHtml: '<p>不明考点</p>', answerHtml: '<p>答案</p>', knowledgePoints: [] },
        ]) }]);
        const result = await generateExercises('user', learningRequestSchema.parse({ mode: 'daily', source: 'network', subject: '数学', count: 1 }));
        expect(result[0].questionText).toContain('一道新题');
        expect(mocks.ai.mock.calls[0][0]).toContain('方程');
        expect(mocks.ai.mock.calls[0][0]).not.toContain('二次函数');
        expect(mocks.publicBank).toHaveBeenCalledWith('数学');
    });
    it('supports all nine school subjects and custom topics', async () => {
        for (const subject of ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他']) {
            const request = learningRequestSchema.parse({ mode: 'ai', source: 'ai', subject, count: 1, prompt: '学习要求', knowledgePoint: '指定考点' });
            const result = await generateExercises('current-user', request);
            expect(result[0].subject).toBe(subject);
            expect(result[0].knowledgePoints).toEqual(['指定考点']);
        }
    });
    it('limits all-chapter generation to the selected publisher and grade', async () => {
        const unit = (id:string,publisher:string,term:string) => ({id,subject:'数学',grade:'小学五年级',region:'上海',publisher,textbook:'数学',schoolSystem:'五四学制',edition:'',isbn:'',volume:'上册',title:term,lessons:[{title:term,page:'1'}],entries:[{kind:'知识点',term,meaning:'准确计算',mastered:false}]});
        mocks.findUser.mockResolvedValue({currentGrade:5,studyPreferences:JSON.stringify({studyUnits:[unit('a','上海教育出版社','小数乘法'),unit('b','人民教育出版社','因数与倍数')]})});
        mocks.createSet.mockImplementation(async ({data})=>({...data,id:'new-set',records:[]}));
        await getOrCreateLearningSet('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',publisher:'上海教育出版社',grade:'小学五年级',count:1}));
        expect(mocks.ai.mock.calls[0][0]).toContain('小数乘法');
        expect(mocks.ai.mock.calls[0][0]).not.toContain('因数与倍数');
        expect(JSON.parse(mocks.createSet.mock.calls[0][0].data.parameters).unitId).toBe('a');
    });
    it('cycles through multiple checked chapters and rejects a chapter from another publisher', async () => {
        const unit = (id:string,publisher:string,term:string) => ({id,subject:'数学',grade:'小学五年级',region:'上海',publisher,textbook:'数学',schoolSystem:'五四学制',edition:'',isbn:'',volume:'上册',title:term,lessons:[{title:term,page:'1'}],entries:[{kind:'知识点',term,meaning:'准确计算',mastered:false}]});
        mocks.findUser.mockResolvedValue({currentGrade:5,studyPreferences:JSON.stringify({studyUnits:[unit('a','上海教育出版社','小数乘法'),unit('b','上海教育出版社','平均数'),unit('c','人民教育出版社','因数与倍数')]})});
        mocks.createSet.mockImplementation(async ({data})=>({...data,id:'multi-set',records:[]}));
        await getOrCreateLearningSet('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',publisher:'上海教育出版社',grade:'小学五年级',unitIds:['a','b'],count:2}));
        expect(mocks.ai.mock.calls[0][0]).toContain('小数乘法');
        expect(mocks.ai.mock.calls[1][0]).toContain('平均数');
        await expect(getOrCreateLearningSet('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',publisher:'上海教育出版社',grade:'小学五年级',unitIds:['a','c'],count:1}))).rejects.toThrow('不属于当前教材');
    });
    it('keeps random generation and chapter selection within the chosen volume', async () => {
        const unit = (id:string,volume:string,term:string) => ({id,subject:'数学',grade:'小学五年级',region:'上海',publisher:'上海教育出版社',textbook:'数学',schoolSystem:'五四学制',edition:'',isbn:'',volume,title:term,lessons:[{title:term,page:'1'}],entries:[{kind:'知识点',term,meaning:'准确计算',mastered:false}]});
        mocks.findUser.mockResolvedValue({currentGrade:5,studyPreferences:JSON.stringify({studyUnits:[unit('upper','上册','小数乘法'),unit('lower','下册','简易方程')]})});
        mocks.createSet.mockImplementation(async ({data})=>({...data,id:'volume-set',records:[]}));
        await getOrCreateLearningSet('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',publisher:'上海教育出版社',grade:'小学五年级',volume:'下册',count:1}));
        expect(mocks.ai.mock.calls[0][0]).toContain('简易方程');
        expect(mocks.ai.mock.calls[0][0]).not.toContain('小数乘法');
        await expect(getOrCreateLearningSet('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',publisher:'上海教育出版社',grade:'小学五年级',volume:'上册',unitIds:['lower'],count:1}))).rejects.toThrow('册别');
    });
    it('uses a checked question from the selected paper as the reference', async () => {
        mocks.findUser.mockResolvedValue({currentGrade:9});
        mocks.findPaper.mockResolvedValue({title:'上海数学试卷',subject:'数学',sourceUrl:'https://example.test/paper',questions:JSON.stringify([{number:'1',grade:9,questionHtml:'<p>求一元二次方程的根</p>',answerHtml:'<p>答案</p>',knowledgePoints:['一元二次方程']}])});
        const result=await generateExercises('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'数学',grade:'初三',paperId:'paper-1',count:1}));
        expect(mocks.ai.mock.calls[0][0]).toContain('一元二次方程');
        expect(result[0].provenance.originalId).toBe('paper-1');
    });
    it('can compose a primary-school AI paper from checked textbook units when the paper library has no match', async () => {
        const unit = (id: string, title: string) => ({ id, subject: '数学', grade: '小学五年级', region: '上海', publisher: '上海教育出版社', textbook: '数学', schoolSystem: '五四学制', edition: '', isbn: '', volume: '上册', title, lessons: [{ title, page: '1' }], entries: [{ kind: '知识点', term: title, meaning: '教材知识点', mastered: false }] });
        mocks.findUser.mockResolvedValue({ currentGrade: 5, studyPreferences: JSON.stringify({ studyUnits: [unit('first', '小数乘法'), unit('second', '平均数')] }) });
        mocks.createSet.mockImplementation(async ({ data }) => ({ ...data, id: 'primary-paper', records: [] }));
        const result = await getOrCreateLearningSet('user', learningRequestSchema.parse({ mode: 'ai', source: 'ai', subject: '数学', grade: '小学五年级', publisher: '上海教育出版社', volume: '上册', paperSets: 1, count: 6 }));
        expect(result.title).toContain('AI 组卷');
        expect(new Set(JSON.parse(mocks.createSet.mock.calls[0][0].data.parameters).unitIds)).toEqual(new Set(['first', 'second']));
        expect(mocks.findPaper).not.toHaveBeenCalled();
        expect(mocks.ai.mock.calls.some(call => call[0].includes('小数乘法'))).toBe(true);
        expect(mocks.ai.mock.calls.some(call => call[0].includes('平均数'))).toBe(true);
    });
    it('allows English custom practice when the selected publisher has no checked English units', async () => {
        mocks.findUser.mockResolvedValue({ currentGrade: 5, studyPreferences: JSON.stringify({ activePublisher: '上海教育出版社', studyCourses: [{ id: 'math', region: '上海', publisher: '上海教育出版社', subject: '数学', grade: '小学五年级', volume: '上册', textbook: '数学', schoolSystem: '五四学制', edition: '', isbn: '' }] }) });
        mocks.createSet.mockImplementation(async ({ data }) => ({ ...data, id: 'english-set', records: [] }));
        await getOrCreateLearningSet('user', learningRequestSchema.parse({ mode: 'ai', source: 'ai', subject: '英语', grade: '小学五年级', publisher: '上海教育出版社', volume: '上册', count: 1 }));
        expect(mocks.ai.mock.calls[0][0]).toContain('英语');
        expect(mocks.ai.mock.calls[0][0]).toContain('没有已核对的知识点');
        expect(mocks.ai.mock.calls[0][0]).not.toContain('教材版本：数学');
    });
    it('does not compose a textbook paper when the current filter has no checked knowledge points', async () => {
        mocks.findUser.mockResolvedValue({ currentGrade: 5, studyPreferences: '{}' });
        await expect(getOrCreateLearningSet('user', learningRequestSchema.parse({ mode: 'ai', source: 'ai', subject: '数学', grade: '小学五年级', volume: '上册', paperSets: 1, count: 6 }))).rejects.toThrow('没有已核对的知识点');
        expect(mocks.ai).not.toHaveBeenCalled();
    });
    it('never reads another users notebook', async () => {
        mocks.findNotebook.mockResolvedValue(null);
        const request = learningRequestSchema.parse({ mode: 'daily', source: 'notebook', notebookId: 'foreign-notebook' });
        await expect(generateExercises('current-user', request)).rejects.toThrow('无权访问');
        expect(mocks.findNotebook).toHaveBeenCalledWith({ where: { id: 'foreign-notebook', userId: 'current-user' } });
        expect(mocks.findErrors).not.toHaveBeenCalled();
    });
    it('gives an actionable empty-notebook error before calling AI', async () => {
        mocks.findErrors.mockResolvedValue([]);
        const request = learningRequestSchema.parse({ mode: 'daily', source: 'notebook' });
        await expect(generateExercises('current-user', request)).rejects.toThrow('先录入一道错题');
        expect(mocks.getAI).not.toHaveBeenCalled();
    });
    it('restores the same daily set without another AI/network request', async () => {
        const saved = { id: 'saved-set' };
        mocks.findSet.mockResolvedValue(saved);
        const request = learningRequestSchema.parse({ mode: 'daily', source: 'network', subject: '数学' });
        expect(await getOrCreateLearningSet('current-user', request)).toBe(saved);
        expect(mocks.publicBank).not.toHaveBeenCalled();
        expect(mocks.ai).not.toHaveBeenCalled();
    });
    it('uses public questions as references for an AI-generated recommendation', async () => {
        mocks.publicBank.mockResolvedValue([1,2,3].map(i=>({ questionText: `题库题 ${i}`, answerText: 'B', analysis:'解析', subject: '数学', knowledgePoints:['加法'], provenance:{name:'公开题库',url:'https://example.test'} })));
        const request = learningRequestSchema.parse({ mode: 'daily', source: 'network', subject: '数学', count: 1 });
        expect((await generateExercises('current-user', request))[0].questionText).toContain('一道新题');
        expect(mocks.ai.mock.calls[0][0]).toContain('题库题');
    });
    it('generates a new exercise from an owned history set and ignores deleted questions',async()=>{mocks.findHistory.mockResolvedValue({questions:JSON.stringify([{questionText:'旧题一',answerText:'A',analysis:'解析',subject:'英语',knowledgePoints:['时态']},{questionText:'已删除题',answerText:'B',analysis:'解析',subject:'数学',knowledgePoints:['加法']}]),deletedIndices:'[1]'});const result=await generateExercises('current-user',learningRequestSchema.parse({mode:'ai',source:'history',historySetId:'old-set',count:1}));expect(mocks.findHistory.mock.calls[0][0].where).toMatchObject({id:'old-set',userId:'current-user',archivedAt:null});expect(mocks.ai.mock.calls[0][0]).toContain('旧题一');expect(mocks.ai.mock.calls[0][0]).not.toContain('已删除题');expect(result[0].subject).toBe('英语');expect(result[0].provenance.originalId).toBe('old-set');});
    it('does not pretend fewer than three public references are three',async()=>{mocks.publicBank.mockResolvedValue([{questionText:'唯一题',answerText:'A',analysis:'解析',subject:'数学',knowledgePoints:[],provenance:{name:'题库'}}]);await expect(generateExercises('user',learningRequestSchema.parse({mode:'daily',source:'network',subject:'数学'}))).rejects.toThrow('不足 3 道');expect(mocks.ai).not.toHaveBeenCalled();});
    it('hides standard answers before submission and restores completed answers', () => {
        const questions = [{ questionText: '测试题', answerText: 'A', correctOption: 'A', analysis: '测试解析', subject: '数学' }];
        const set = { id: 'set', dateKey: '2026-10-09', title: '每日题', source: 'network', parameters: '{}', questions: JSON.stringify(questions), records: [] };
        const fresh = learningSetForClient(set).questions[0];
        expect(fresh).not.toHaveProperty('answerText');
        expect(fresh).not.toHaveProperty('correctOption');
        const completed = learningSetForClient({ ...set, records: [{ exerciseIndex: 0, userAnswer: 'B', isCorrect: false }] }).questions[0];
        expect(completed.answerText).toBe('A');
        expect(completed.record?.isCorrect).toBe(false);
        expect(completed).not.toHaveProperty('correctOption');
    });
});

it('fills a grade-five public-bank shortage using configured AI and labels the source', async () => {
 mocks.findUser.mockResolvedValue({currentGrade:5}); mocks.papers.mockResolvedValue([]);mocks.publicBank.mockResolvedValue([1,2,3].map(i=>({questionText:`公开语文题 ${i}`,answerText:'答案',analysis:'解析',subject:'语文',knowledgePoints:['阅读'],provenance:{name:'公开题库',url:'https://example.test'}})));
 const result=await generateExercises('user',learningRequestSchema.parse({mode:'daily',source:'network',subject:'语文',count:2}));
 expect(result).toHaveLength(2); expect(result[0].provenance.name).toContain('AI 变式');
 expect(mocks.ai.mock.calls[0][0]).toContain('小学五年级');
 expect(mocks.ai.mock.calls[0][0]).toContain('公开语文题');
});

it('generates a manually configured subject using its own textbook',async()=>{mocks.findUser.mockResolvedValue({currentGrade:5,studyPreferences:JSON.stringify({subjectTextbooks:[{subject:'日语',textbook:'标准日本语'},{subject:'英语',textbook:'外研版'}]})});const result=await generateExercises('user',learningRequestSchema.parse({mode:'ai',source:'ai',subject:'日语',count:1}));expect(result[0].subject).toBe('日语');expect(mocks.ai.mock.calls[0][0]).toContain('标准日本语');expect(mocks.ai.mock.calls[0][0]).not.toContain('外研版');});
