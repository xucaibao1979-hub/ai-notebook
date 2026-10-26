import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
export async function GET(req: Request) {
 const session = await getServerSession(authOptions);
 if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status:401 });
 const paperId = new URL(req.url).searchParams.get('paperId');
 const records = await prisma.paperAttempt.findMany({ where: { userId: session.user.id, ...(paperId ? { paperId } : {}) }, orderBy: { updatedAt:'desc' }, take:100 });
 const papers = await prisma.knowledgePaper.findMany({ where: { id: { in: records.map(r=>r.paperId) } }, select: { id:true,title:true,subject:true,year:true } });
 return NextResponse.json(records.map(r=>({...r,answers:JSON.parse(r.answers),paper:papers.find(p=>p.id===r.paperId)})));
}
const schema = z.object({ paperId:z.string().min(1), id:z.string().optional(), answers:z.record(z.string(),z.string().max(10000)), completed:z.boolean().default(false),durationSeconds:z.number().int().min(0).max(604800).default(0) });
export async function POST(req: Request) {
 const session = await getServerSession(authOptions);
 if (!session?.user?.id) return NextResponse.json({ message:'请先登录' }, {status:401});
 const parsed=schema.safeParse(await req.json());
 if(!parsed.success) return NextResponse.json({message:'作答内容格式不正确'}, {status:400});
 const {paperId,id,answers,completed,durationSeconds}=parsed.data;
 const paper=await prisma.knowledgePaper.findUnique({where:{id:paperId},select:{questions:true}});
 if(!paper) return NextResponse.json({message:'试卷不存在'}, {status:404});
 const numbers=new Set((JSON.parse(paper.questions) as {number:string}[]).map(q=>q.number));
 if(Object.keys(answers).some(n=>!numbers.has(n))) return NextResponse.json({message:'存在不属于该试卷的题号'}, {status:400});
 if(id) {
  const count=await prisma.paperAttempt.updateMany({where:{id,userId:session.user.id,paperId},data:{answers:JSON.stringify(answers),completed,durationSeconds}});
  if(!count.count) return NextResponse.json({message:'记录不存在'}, {status:404});
  return NextResponse.json({id});
 }
 const record=await prisma.paperAttempt.create({data:{userId:session.user.id,paperId,answers:JSON.stringify(answers),completed}});
 return NextResponse.json({id:record.id});
}
