import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),find:vi.fn(),list:vi.fn(),papers:vi.fn(),create:vi.fn(),update:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:m.session}));vi.mock('@/lib/auth',()=>({authOptions:{}}));
vi.mock('@/lib/prisma',()=>({prisma:{knowledgePaper:{findUnique:m.find,findMany:m.papers},paperAttempt:{findMany:m.list,create:m.create,updateMany:m.update}}}));
import {GET,POST} from '@/app/api/knowledge-library/history/route';
const request=(body:object)=>new Request('http://localhost/history',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{m.session.mockResolvedValue({user:{id:'u'}});m.find.mockResolvedValue({questions:JSON.stringify([{number:'1'}])});m.create.mockResolvedValue({id:'new'});m.update.mockResolvedValue({count:1});m.list.mockResolvedValue([{id:'a',paperId:'p',answers:'{"1":"答案"}'}]);m.papers.mockResolvedValue([{id:'p',title:'数学卷'}]);});
describe('paper attempt history',()=>{
 it('requires login',async()=>{m.session.mockResolvedValue(null);expect((await GET(new Request('http://localhost/history'))).status).toBe(401);});
 it('saves answers with the authenticated user and completion state',async()=>{expect((await POST(request({paperId:'p',answers:{'1':'答案'},completed:true}))).status).toBe(200);expect(m.create.mock.calls[0][0].data).toMatchObject({userId:'u',completed:true,answers:'{"1":"答案"}'});});
 it('scopes updates to the owner and refuses foreign attempts',async()=>{m.update.mockResolvedValue({count:0});expect((await POST(request({paperId:'p',id:'foreign',answers:{'1':'答案'}}))).status).toBe(404);expect(m.update.mock.calls[0][0].where).toEqual({id:'foreign',userId:'u',paperId:'p'});});
 it('refuses invented question numbers',async()=>{expect((await POST(request({paperId:'p',answers:{'2':'答案'}}))).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
 it('restores answers and sorts personal history newest first',async()=>{const r=await GET(new Request('http://localhost/history'));expect((await r.json())[0].answers).toEqual({'1':'答案'});expect(m.list.mock.calls[0][0]).toMatchObject({where:{userId:'u'},orderBy:{updatedAt:'desc'}});});
});
