import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {homeworkQuestionSchema} from '@/lib/homework';
import {collectHomeworkQuestion} from '@/lib/homework-collection';
import {z} from 'zod';
import {currentStudentGrade,STUDENT_GRADES} from '@/lib/student-grade';
export async function POST(req:Request){
 const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 try{
  const {id,index,question,action}=z.object({id:z.string(),index:z.number().int().min(0).max(29),question:homeworkQuestionSchema,action:z.enum(['keep','remove']).default('keep')}).parse(await req.json());
  const user=await prisma.user.findUniqueOrThrow({where:{id:s.user.id}});const grade=currentStudentGrade(user);
  const item=await prisma.$transaction(async tx=>{
   const review=await tx.homeworkReview.findFirst({where:{id,userId:s.user.id}});
   if(!review||!JSON.parse(review.questions)[index])throw new Error('批改题目不存在');
   if(action==='keep'&&question.judgement!=='wrong')throw new Error('请先确认该题确实答错，待确认或正确题目不会收录');
   const corrected=JSON.parse(review.questions);corrected[index]={...question,retention:action==='keep'?'kept':'removed'};
   const updated=await tx.homeworkReview.updateMany({where:{id,userId:s.user.id,questions:review.questions},data:{questions:JSON.stringify(corrected)}});
   if(updated.count!==1)throw new Error('记录已更新，请刷新后重试');
   if(action==='keep')return collectHomeworkQuestion(tx,s.user.id,{id:review.id,image:''},index,question,grade?STUDENT_GRADES[grade]:null);
   const old=await tx.errorItem.findFirst({where:{userId:s.user.id,source:'homework:'+id+':'+index}});
   if(!old)throw new Error('此题尚未收录');
   return tx.errorItem.update({where:{id:old.id},data:{archivedAt:new Date()}});
  });return NextResponse.json({id:item.id,removed:action==='remove'});
 }catch(e){return NextResponse.json({message:e instanceof z.ZodError?'请确认题干、正确答案与解题思路完整':e instanceof Error?e.message:'保存失败，请重试'},{status:400});}
}
