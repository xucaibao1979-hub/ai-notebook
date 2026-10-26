import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),count:vi.fn(),list:vi.fn(),groups:vi.fn(),aggregate:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:m.session}));vi.mock('@/lib/auth',()=>({authOptions:{}}));
vi.mock('@/lib/prisma',()=>({prisma:{knowledgePaper:{count:m.count,findMany:m.list,groupBy:m.groups,aggregate:m.aggregate}}}));
import {GET} from '@/app/api/knowledge-library/route';
beforeEach(()=>{m.session.mockResolvedValue({user:{id:'u'}});m.count.mockResolvedValue(0);m.list.mockResolvedValue([]);m.groups.mockResolvedValue([]);m.aggregate.mockResolvedValue({_count:{id:0},_sum:{questionCount:0,answerCount:0}});});
it('combines an older year with the selected subject instead of ignoring the year',async()=>{const response=await GET(new Request('http://localhost/library?year=2014&subject=数学'));expect(response.status).toBe(200);expect(m.count.mock.calls[0][0].where).toMatchObject({year:2014,subject:'数学'});expect((await response.json()).total).toBe(0);});
it('searches all collected years when no year is specified',async()=>{await GET(new Request('http://localhost/library?subject=语文'));expect(m.count.mock.calls[0][0].where.year).toBeUndefined();});
it('rejects an invalid year rather than silently returning unrelated papers',async()=>{expect((await GET(new Request('http://localhost/library?year=abcd'))).status).toBe(400);expect(m.count).not.toHaveBeenCalled();});

it('combines platform and complete-original filters with year and subject',async()=>{await GET(new Request('http://localhost/library?year=2025&subject=数学&source=中国教育在线&format=images'));expect(m.count.mock.calls[0][0].where).toMatchObject({year:2025,subject:'数学',sourceName:'中国教育在线',status:'image_original'});});
