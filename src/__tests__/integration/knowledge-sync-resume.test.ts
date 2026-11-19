import path from 'path';
import {beforeEach,expect,it,vi} from 'vitest';

const mocks=vi.hoisted(()=>({session:vi.fn(),exists:vi.fn(),read:vi.fn(),mkdir:vi.fn(),open:vi.fn(),close:vi.fn(),spawn:vi.fn(),unref:vi.fn()}));
vi.mock('next-auth',()=>({getServerSession:mocks.session}));
vi.mock('@/lib/auth',()=>({authOptions:{}}));
vi.mock('fs',()=>({default:{existsSync:mocks.exists,readFileSync:mocks.read,mkdirSync:mocks.mkdir,openSync:mocks.open,closeSync:mocks.close}}));
vi.mock('child_process',()=>({spawn:mocks.spawn,default:{spawn:mocks.spawn}}));
import {GET,POST} from '@/app/api/knowledge-library/sync/route';

beforeEach(()=>{
 mocks.session.mockResolvedValue({user:{role:'admin'}});
 mocks.exists.mockImplementation((file:string)=>!file.endsWith('sync.lock') && !file.endsWith('sync-knowledge-library.js'));
 mocks.read.mockReturnValue(JSON.stringify({state:'rate_limited',discovered:2033,processed:1859,completedUrls:['https://kaosj.com/papers/saved/'],errors:[]}));
 mocks.open.mockReturnValue(1);
 mocks.spawn.mockImplementation(()=>({once:(event:string,handler:()=>void)=>{if(event==='spawn')handler();},unref:mocks.unref}));
});

it('continues after old rate limit with the resume flag and keeps the checkpoint private',async()=>{
 const status=await GET();
 expect((await status.json()).completedUrls).toBeUndefined();
 expect((await POST()).status).toBe(202);
 expect(mocks.spawn.mock.calls[0][1]).toContain('--resume');
 expect(mocks.unref).toHaveBeenCalled();
});

it('runs the packaged JavaScript worker without ts-node',async()=>{
 mocks.exists.mockImplementation((file:string)=>!file.endsWith('sync.lock') && !file.endsWith('sync-knowledge-library.ts') && !file.endsWith('node_modules/ts-node/dist/bin.js'));
 expect((await POST()).status).toBe(202);
 expect(mocks.spawn.mock.calls.at(-1)?.[1]).toContain(path.join(process.cwd(),'scripts','sync-knowledge-library.js'));
});

it('resolves the script, runner and checkpoint from the project when launched in its parent',async()=>{
 const project=process.cwd();
 const parent=path.dirname(project);
 const cwd=vi.spyOn(process,'cwd').mockReturnValue(parent);
 mocks.exists.mockImplementation((file:string)=>!file.endsWith('sync.lock') && !file.endsWith('sync-knowledge-library.js') && file!==path.join(parent,'scripts','sync-knowledge-library.ts'));
 try{
  vi.resetModules();
  const {POST:post,GET:get}=await import('@/app/api/knowledge-library/sync/route');
  expect((await get()).status).toBe(200);
  expect(mocks.read).toHaveBeenCalledWith(path.join(project,'data','knowledge-library','sync-status.json'),'utf8');
  expect((await post()).status).toBe(202);
  expect(mocks.spawn.mock.calls.at(-1)?.[1]).toContain(path.join(project,'scripts','sync-knowledge-library.ts'));
  expect(mocks.spawn.mock.calls.at(-1)?.[2]?.cwd).toBe(project);
 }finally{cwd.mockRestore();}
});

it('treats legacy HTTP 403 as access denied and does not restart the source',async()=>{
 mocks.read.mockReturnValue(JSON.stringify({state:'rate_limited',discovered:2037,processed:1858,errors:[{url:'https://kaosj.com/papers/2022/example/',message:'HTTP 403'}],completedUrls:[]}));
 await expect((await GET()).json()).resolves.toMatchObject({state:'access_denied'});
 const response=await POST();
 expect(response.status).toBe(403);
 expect(mocks.spawn).not.toHaveBeenCalled();
});

it('respects a source Retry-After checkpoint',async()=>{
 mocks.read.mockReturnValue(JSON.stringify({state:'rate_limited',retryAt:'2999-01-01T00:00:00.000Z',errors:[{url:'https://kaosj.com/papers/2022/example/',message:'HTTP 429'}]}));
 expect((await POST()).status).toBe(429);
 expect(mocks.spawn).not.toHaveBeenCalled();
});

it('allows only the other sources to start while the first host is denied',async()=>{
 mocks.read.mockReturnValue(JSON.stringify({state:'access_denied',errors:[{url:'https://kaosj.com/papers/2022/example/',message:'HTTP 403'}]}));
 expect((await POST()).status).toBe(403);
 expect((await POST(new Request('http://localhost/api/knowledge-library/sync?source=other',{method:'POST'}))).status).toBe(202);
 expect(mocks.spawn.mock.calls.at(-1)?.[1]).toContain('--image-only');
 expect(mocks.spawn.mock.calls.at(-1)?.[1]).toContain('--resume');
});

it('allows cached reparse without restarting the denied online source',async()=>{
 mocks.read.mockReturnValue(JSON.stringify({state:'access_denied',errors:[{url:'https://kaosj.com/papers/2022/example/',message:'HTTP 403'}]}));
 expect((await POST()).status).toBe(403);
 expect((await POST(new Request('http://localhost/api/knowledge-library/sync?source=cache',{method:'POST'}))).status).toBe(202);
 expect(mocks.spawn.mock.calls.at(-1)?.[1]).toContain('--cache-only');
 expect((await GET(new Request('http://localhost/api/knowledge-library/sync?source=cache'))).status).toBe(200);
 expect(mocks.read).toHaveBeenCalledWith(expect.stringContaining('cache-sync-status.json'),'utf8');
});

it('does not start another sync while a lock exists',async()=>{
 mocks.exists.mockImplementation((file:string)=>file.endsWith('sync.lock'));
 expect((await POST()).status).toBe(409);
 expect(mocks.spawn).not.toHaveBeenCalled();
});
