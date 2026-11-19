import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/lib/api-client',()=>({apiClient:{get:mock.get},friendlyApiError:(error:unknown)=>String(error)}));
vi.mock('@/components/learning-workspace',()=>({ExerciseCard:({index}:{index:number})=><div data-testid="exercise-card">完整题卡 {index+1}</div>}));
import {LearningHistory} from '@/components/learning-history';

let host:HTMLDivElement;
let root:Root;
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();});

it('shows a single filter row with date inputs but no visible date labels, and expands directly to cards',async()=>{
 const entry={id:'set-123456',title:'今日专属练习',subject:'语文',grade:'五年级',source:'ai',createdAt:'2026-11-16T09:11:46.000Z',dateKey:null,favorited:false,favorites:0,count:3,completed:0,questions:[]};
 mock.get.mockImplementation(async(path:string)=>path.startsWith('/api/learning/history')?{items:[entry],total:1}:{id:entry.id,questions:[{deleted:false},{deleted:true},{deleted:false}]});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(<LearningHistory/>));
 expect(host.querySelectorAll('input[type="date"]')).toHaveLength(2);
 expect(host.textContent).not.toMatch(/开始日期|结束日期/);
 expect(host.querySelector('[aria-label="历史开始日期"]')).toBeTruthy();
 expect(host.querySelector('[aria-label="历史结束日期"]')).toBeTruthy();
 expect(host.querySelector('input[aria-label="搜索练习历史"]')?.parentElement?.className).toContain('flex-nowrap');
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300));});
 const details=host.querySelector('details')!;
 await act(async()=>{details.querySelector('summary')!.click();});
 expect(host.querySelectorAll('[data-testid="exercise-card"]')).toHaveLength(2);
 expect(host.textContent).not.toMatch(/点击每题“展开”/);
 expect(host.querySelector('a[href*="indices=0,2"]')?.textContent).toContain('打印当前题目（2）');
});
