import {it,expect,vi,beforeEach} from 'vitest';
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
const m=vi.hoisted(()=>({session:vi.fn(),find:vi.fn(),updateSchedules:vi.fn(),createSchedule:vi.fn(),updateError:vi.fn(),user:vi.fn(),errors:vi.fn(),records:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:m.session}));vi.mock('@/lib/auth',()=>({authOptions:{}}));
vi.mock('@/lib/prisma',()=>({prisma:{
  $transaction:(fn:(tx:unknown)=>unknown)=>fn({errorItem:{findFirst:m.find,update:m.updateError},reviewSchedule:{updateMany:m.updateSchedules,create:m.createSchedule}}),
  user:{findUniqueOrThrow:m.user},errorItem:{findMany:m.errors},practiceRecord:{findMany:m.records}
}}));
import {POST} from '@/app/api/study-plan/review/route';
import {GET} from '@/app/api/study-plan/route';
import {TodayStudyPlan} from '@/components/today-study-plan';
import {apiClient} from '@/lib/api-client';
vi.mock('@/lib/api-client',()=>({apiClient:{get:vi.fn(),post:vi.fn()},friendlyApiError:()=> '保存失败'}));
vi.mock('next/link',()=>({default:({href,children,...props}:{href:string;children:React.ReactNode})=>
  createElement('a',{href,...props},children)}));
vi.mock('@/components/markdown-renderer',()=>({MarkdownRenderer:({content}:{content:string})=>createElement('span',null,content)}));
const request=(result='mastered')=>new Request('http://localhost/review',{method:'POST',body:JSON.stringify({id:'error',answer:'独立作答',result})});
beforeEach(()=>{
  m.session.mockResolvedValue({user:{id:'u'}});
  m.find.mockResolvedValue({id:'error',userNotes:'原笔记',errorType:null,reviewSchedules:[]});
  m.user.mockResolvedValue({studyPreferences:null});
  m.errors.mockResolvedValue([]);
  m.records.mockResolvedValue([]);
});
it('checks owner and blocks unauthorized review',async()=>{m.session.mockResolvedValue(null);expect((await POST(request())).status).toBe(401);m.session.mockResolvedValue({user:{id:'u'}});m.find.mockResolvedValue(null);expect((await POST(request())).status).toBe(400);expect(m.find.mock.calls[0][0].where).toEqual({id:'error',userId:'u'});expect(m.createSchedule).not.toHaveBeenCalled();});
it('requires different dates before marking mastery',async()=>{expect((await POST(request())).status).toBe(200);expect(m.updateError.mock.calls[0][0].data.masteryLevel).toBe(1);expect(m.createSchedule).toHaveBeenCalledTimes(2);});
it('does not count duplicate due schedules as independent attempts',async()=>{m.find.mockResolvedValue({id:'error',reviewSchedules:[{id:'due1',scheduledFor:new Date(Date.now()-86400000),completedAt:null,isCorrect:null},{id:'due2',scheduledFor:new Date(Date.now()-2*86400000),completedAt:null,isCorrect:null}]});expect((await POST(request('careless'))).status).toBe(200);expect(m.createSchedule).toHaveBeenCalledTimes(1);expect(m.updateError.mock.calls[0][0].data.errorType).toBe('粗心出错');});
it('refuses a second review result on the same calendar day',async()=>{m.find.mockResolvedValue({id:'error',reviewSchedules:[{completedAt:new Date(),isCorrect:true}]});expect((await POST(request())).status).toBe(400);expect(m.updateError).not.toHaveBeenCalled();});

const item=(id:string,reviewSchedules:{scheduledFor:Date;completedAt:Date|null;isCorrect:boolean|null}[]=[])=>({
  id,masteryLevel:0,questionText:`题目 ${id}`,answerText:'答案',analysis:'解析',
  createdAt:new Date('2024-01-01'),errorType:null,subject:{name:'数学'},
  tags:[{name:'函数'}],reviewSchedules
});
const schedule=(scheduledFor:Date,completedAt:Date|null=null)=>({scheduledFor,completedAt,isCorrect:null});

it('separates due reviews, unscheduled old errors and future reviews while retaining statistics',async()=>{
  const yesterday=new Date(Date.now()-86400000);
  const tomorrow=new Date(Date.now()+86400000);
  m.errors.mockResolvedValue([
    item('due',[schedule(yesterday)]),
    item('old'),
    item('future',[schedule(tomorrow)]),
    item('done',[schedule(yesterday,new Date())])
  ]);
  const response=await GET();
  expect(response.status).toBe(200);
  const plan=await response.json();
  expect(plan.tasks.map((task:{id:string})=>task.id)).toEqual(['due']);
  expect(plan.pendingCorrections.map((task:{id:string})=>task.id)).toEqual(['old']);
  expect(plan.dueCount).toBe(1);
  expect(plan.pendingCorrectionCount).toBe(1);
  expect(plan.todaySuggestion).toContain('先复习 1 道到期错题');
  expect(plan.completedToday).toBe(1);
  expect(plan).toMatchObject({dailyMinutes:expect.any(Number),recommendedCount:expect.any(Number),
    knowledgePoints:expect.any(Array),causes:expect.any(Array),objective:{correct:0,total:0},
    self:{correct:0,total:0},unknown:0,review:{correct:0,total:0},trend:[]});
});

it('shows three steps and hides the full error link until answering',async()=>{
  const actEnvironment=globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT?:boolean};
  const previousActEnvironment=actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT=true;
  const task={id:'due',subject:'数学',questionText:'题目',answerText:'答案',analysis:'解析',reason:'已到复习时间',curriculum:'教材',knowledgePoints:['函数']};
  const plan={dailyMinutes:30,completedToday:0,tasks:[task],dueCount:1,pendingCorrectionCount:0,
    pendingCorrections:[],todaySuggestion:'先复习',recommendedCount:3,
    knowledgePoints:[],causes:[],objective:{correct:0,total:0},self:{correct:0,total:0},
    unknown:0,review:{correct:0,total:0},trend:[]};
  vi.mocked(apiClient.get).mockResolvedValue(plan);
  vi.mocked(apiClient.post).mockResolvedValue({});
  const container=document.createElement('div');
  const root=createRoot(container);
  await act(async()=>{root.render(createElement(TodayStudyPlan));});
  expect(container.textContent).toContain('今日三步行动');
  expect(container.textContent).toContain('无计划旧题待订正');
  expect(container.textContent).toContain('针对薄弱点练习');
  expect(container.querySelector('a[href="/error-items/due"]')).toBeNull();
  const reviewCard=container.querySelector('details.rounded-xl')!;
  expect(reviewCard.hasAttribute('open')).toBe(false);
  await act(async()=>{Array.from(container.querySelectorAll('button')).find(node=>node.textContent==='开始快速复习')!.click();});
  expect(reviewCard.hasAttribute('open')).toBe(true);
  const button=Array.from(container.querySelectorAll('button')).find(node=>node.textContent?.includes('对照答案'))!;
  expect(button.disabled).toBe(true);
  const textarea=container.querySelector('textarea')!;
  await act(async()=>{
    const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
    setter.call(textarea,'我的作答');
    textarea.dispatchEvent(new Event('input',{bubbles:true}));
  });
  expect(button.disabled).toBe(false);
  await act(async()=>{button.click();});
  expect(container.textContent).toContain('答案');
  expect(container.querySelector('a[href="/error-items/due"]')).not.toBeNull();
  await act(async()=>{Array.from(container.querySelectorAll('button')).find(node=>node.textContent==='已掌握')!.click();});
  expect(apiClient.post).toHaveBeenCalledWith('/api/study-plan/review', {id:'due',answer:'我的作答',result:'mastered'});
  expect(apiClient.get).toHaveBeenCalledTimes(2);
  await act(async()=>{root.unmount();});
  actEnvironment.IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;
});

it('does not count future schedules or already completed reviews as due',async()=>{
  const tomorrow=new Date(Date.now()+86400000);
  m.errors.mockResolvedValue([item('future',[schedule(tomorrow)]),item('done',[schedule(new Date(),new Date())])]);
  const plan=await (await GET()).json();
  expect(plan.tasks).toEqual([]);
  expect(plan.pendingCorrections).toEqual([]);
  expect(plan.dueCount).toBe(0);
  expect(plan.pendingCorrectionCount).toBe(0);
});
