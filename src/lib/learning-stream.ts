import type {LearningRequest,LearningSetResponse} from './learning';

type Task = {id:string;status:'pending'|'running'|'succeeded'|'failed';result:LearningSetResponse|null;error:string|null};
const taskKey=(mode:'daily'|'ai')=>`learning-task-${mode}`;

export function pendingLearningTask(mode:'daily'|'ai'):{id:string}|null{
 try{const raw=localStorage.getItem(taskKey(mode));return raw?JSON.parse(raw):null;}catch{return null;}
}

export async function resumeLearningTask(id:string,mode:'daily'|'ai',onProgress:(stage:string)=>void):Promise<LearningSetResponse>{
 const deadline=Date.now()+5*60_000;
 for(;;){
  let response:Response;
  try{response=await fetch(`/api/study-tasks?id=${encodeURIComponent(id)}`,{cache:'no-store'});}catch{throw new Error('连接中断；任务仍可能在后台运行，请稍后刷新页面。');}
  if(!response.ok){if(response.status===404&&pendingLearningTask(mode)?.id===id)localStorage.removeItem(taskKey(mode));const data=await response.json().catch(()=>({}));throw new Error(data.message||'任务状态读取失败');}
  const task=await response.json() as Task;
  if(task.status==='succeeded'&&task.result){if(pendingLearningTask(mode)?.id===id)localStorage.removeItem(taskKey(mode));return task.result;}
  if(task.status==='failed'){if(pendingLearningTask(mode)?.id===id)localStorage.removeItem(taskKey(mode));throw new Error(task.error||'出题失败，请重试');}
  onProgress(task.status==='pending'?'出题任务等待开始；刷新后仍可继续查看…':'正在生成并校验题目；刷新后仍可继续查看…');
  if(Date.now()>deadline)throw new Error('等待已超过 5 分钟；任务仍可能在后台运行，请稍后刷新页面查看结果。');
  await new Promise(resolve=>setTimeout(resolve,2500));
 }
}

export async function generateWithProgress(request:Omit<Partial<LearningRequest>,'subject'> & {subject?:string},onProgress:(stage:string)=>void):Promise<LearningSetResponse>{
 const mode=request.mode==='daily'?'daily':'ai';
 onProgress('正在提交出题任务…');
 let response:Response;
 try{response=await fetch('/api/study-tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'exercise',request})});}
 catch{throw new Error('无法提交出题任务，请检查本地服务连接。');}
 if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'出题任务提交失败');}
 const task=await response.json() as Task;
 try{localStorage.setItem(taskKey(mode),JSON.stringify({id:task.id}));}catch{}
 return resumeLearningTask(task.id,mode,onProgress);
}
