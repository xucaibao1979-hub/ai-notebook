import {it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({session:vi.fn(),remove:vi.fn()}));vi.mock('next-auth',()=>({getServerSession:m.session}));vi.mock('@/lib/auth',()=>({authOptions:{}}));vi.mock('@/lib/prisma',()=>({prisma:{user:{updateMany:m.remove}}}));
import {DELETE} from '@/app/api/family/route';
const req=(id:string)=>new Request('http://localhost/api/family',{method:'DELETE',body:JSON.stringify({id})});
beforeEach(()=>{vi.clearAllMocks();m.session.mockResolvedValue({user:{id:'child',accountId:'parent'}});m.remove.mockResolvedValue({count:1});});
it('rejects unauthenticated deletion',async()=>{m.session.mockResolvedValue(null);expect((await DELETE(req('child'))).status).toBe(401);expect(m.remove).not.toHaveBeenCalled();});
it('protects the root account',async()=>{expect((await DELETE(req('parent'))).status).toBe(400);expect(m.remove).not.toHaveBeenCalled();});
it('only deactivates owned active children and retains their records',async()=>{expect((await DELETE(req('child'))).status).toBe(200);expect(m.remove).toHaveBeenCalledWith({where:{id:'child',parentUserId:'parent',isActive:true},data:{isActive:false}});});
it('rejects a child from another household',async()=>{m.remove.mockResolvedValue({count:0});expect((await DELETE(req('foreign'))).status).toBe(404);});
