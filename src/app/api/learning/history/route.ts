import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import type {Prisma} from '@prisma/client';
import {LEARNING_HISTORY_PAGE_SIZE,type LearningExercise} from '@/lib/learning';
export async function GET(req:Request){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 const query=new URL(req.url).searchParams;const page=Math.max(1,Math.floor(Number(query.get('page'))||1));
 const from=query.get('from'),to=query.get('to');
 const where:Prisma.LearningSetWhereInput={userId:session.user.id,archivedAt:query.get('trash')==='1'?{not:null}:null,
  ...(query.get('favorites')==='1'?{OR:[{favorited:true},{favoriteIndices:{not:'[]'}}]}:{}),
  ...(query.get('search')?{title:{contains:query.get('search')!.slice(0,100)}}:{}),
  ...(query.get('source')?{source:query.get('source')!}:{}),
  ...((from&&/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&/^\d{4}-\d{2}-\d{2}$/.test(to))?{createdAt:{...(from&&/^\d{4}-\d{2}-\d{2}$/.test(from)?{gte:new Date(from+'T00:00:00+08:00')} :{}),...(to&&/^\d{4}-\d{2}-\d{2}$/.test(to)?{lt:new Date(new Date(to+'T00:00:00+08:00').getTime()+86400000)}:{})}}:{})};
 const rows=await prisma.learningSet.findMany({where,orderBy:{createdAt:'desc'},include:{records:true}});
 const items=rows.map(r=>{
  const questions=JSON.parse(r.questions) as LearningExercise[];const deleted=new Set<number>(JSON.parse(r.deletedIndices));const favorites=new Set<number>(JSON.parse(r.favoriteIndices));const parameters=JSON.parse(r.parameters);
  const active=questions.map((q,index)=>({...q,index})).filter(q=>!deleted.has(q.index));const completed=r.records.filter(record=>record.exerciseIndex!==null&&!deleted.has(record.exerciseIndex)).length;
  return {id:r.id,title:r.title,source:r.source,dateKey:r.dateKey,createdAt:r.createdAt,archivedAt:r.archivedAt,favorited:r.favorited,favorites:favorites.size,count:active.length,completed,grade:parameters.grade||'',subject:parameters.subject||active[0]?.subject||'',questions:active.map(q=>({index:q.index,questionText:q.questionText,subject:q.subject,answered:r.records.some(record=>record.exerciseIndex===q.index)}))};
 }).filter(r=>(!query.get('subject')||r.subject===query.get('subject'))&&(!query.get('grade')||r.grade.includes(query.get('grade')!))&&(!query.get('status')||(query.get('status')==='completed'?r.count>0&&r.completed===r.count:r.completed<r.count)));
 return NextResponse.json({total:items.length,page,pageSize:LEARNING_HISTORY_PAGE_SIZE,items:items.slice((page-1)*LEARNING_HISTORY_PAGE_SIZE,page*LEARNING_HISTORY_PAGE_SIZE)});
}
