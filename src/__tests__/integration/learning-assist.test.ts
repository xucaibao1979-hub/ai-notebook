import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),set:vi.fn(),record:vi.fn(),update:vi.fn(),transaction:vi.fn(),profile:vi.fn(),review:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:m.session}));vi.mock('@/lib/auth',()=>({authOptions:{}}));
vi.mock('@/lib/prisma',()=>({prisma:{user:{findUnique:m.profile},learningSet:{findFirst:m.set,updateMany:m.update},practiceRecord:{findUnique:m.record},$transaction:m.transaction}}));
vi.mock('@/lib/ai',()=>({getAIService:()=>({reanswerQuestion:m.review})}));
vi.mock('@/lib/learning-service',()=>({generateExercises:vi.fn()}));
import {POST} from '@/app/api/learning/assist/route';
const req=(body:object)=>new Request('http://localhost/assist',{method:'POST',body:JSON.stringify({setId:'set',index:0,...body})});
beforeEach(()=>{m.session.mockResolvedValue({user:{id:'u'}});m.set.mockResolvedValue({id:'set',questions:JSON.stringify([{questionText:'1+1=?',answerText:'2',analysis:'相加',subject:'数学',knowledgePoints:['加法'],provenance:{name:'AI'}}]),deletedIndices:'[]'});m.record.mockResolvedValue(null);m.update.mockResolvedValue({count:1});m.profile.mockResolvedValue({studyPreferences:'{}'});m.review.mockResolvedValue({analysis:'先确定加数，再计算'});});
it('requires authentication and refuses foreign sets',async()=>{m.session.mockResolvedValue(null);expect((await POST(req({action:'hint'}))).status).toBe(401);m.session.mockResolvedValue({user:{id:'u'}});m.set.mockResolvedValue(null);expect((await POST(req({action:'hint'}))).status).toBe(404);expect(m.set.mock.calls[0][0].where).toEqual({id:'set',userId:'u',archivedAt:null});});
it('refuses deleted exercises before calling AI',async()=>{m.set.mockResolvedValue({questions:'[{}]',deletedIndices:'[0]'});expect((await POST(req({action:'hint'}))).status).toBe(404);expect(m.review).not.toHaveBeenCalled();});
it('requires a submitted wrong answer before transfer',async()=>{expect((await POST(req({action:'to-notebook'}))).status).toBe(400);expect(m.transaction).not.toHaveBeenCalled();});
it('requires a submitted answer before grading',async()=>{expect((await POST(req({action:'grade'}))).status).toBe(400);expect(m.review).not.toHaveBeenCalled();});
it('persists feedback optimistically without changing the correct answer',async()=>{expect((await POST(req({action:'feedback',message:'题目疑似超纲'}))).status).toBe(200);const q=JSON.parse(m.update.mock.calls[0][0].data.questions)[0];expect(q.answerText).toBe('2');expect(q.feedback[0].message).toBe('题目疑似超纲');m.update.mockResolvedValue({count:0});expect((await POST(req({action:'feedback',message:'反馈'}))).status).toBe(409);});
it('returns a step hint without saving a scored record',async()=>{const r=await POST(req({action:'hint',step:2}));expect((await r.json()).text).toContain('加数');expect(m.review.mock.calls[0][0]).toContain('第 2 步');expect(m.update).not.toHaveBeenCalled();});

it('uses the matching subject curriculum during review hints',async()=>{m.profile.mockResolvedValue({studyPreferences:JSON.stringify({subjectTextbooks:[{subject:'数学',textbook:'人教版',chapter:'加法'},{subject:'英语',textbook:'外研版'}]})});await POST(req({action:'hint'}));expect(m.review.mock.calls[0][0]).toContain('人教版');expect(m.review.mock.calls[0][0]).not.toContain('外研版');});
