import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {homeworkQuestionSchema} from '@/lib/homework';
import {collectHomeworkQuestion} from '@/lib/homework-collection';
import {currentStudentGrade,STUDENT_GRADES} from '@/lib/student-grade';
import {z} from 'zod';

export async function POST(req:Request){
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
  try{
    const {question,reviewId,index}=z.object({question:homeworkQuestionSchema,reviewId:z.string().min(1),index:z.number().int().min(0).max(39)}).parse(await req.json());
    const review=await prisma.homeworkReview.findFirst({where:{id:reviewId,userId:session.user.id},select:{id:true}});
    if(!review)return NextResponse.json({message:'上传记录不存在或无权访问'},{status:404});
    const user=await prisma.user.findUniqueOrThrow({where:{id:session.user.id}});
    const grade=currentStudentGrade(user);
    const item=await prisma.$transaction(tx=>collectHomeworkQuestion(tx,session.user!.id!,{id:review.id,image:''},index,question,grade?STUDENT_GRADES[grade]:null,'homework-manual'));
    return NextResponse.json({id:item.id});
  }catch(e){return NextResponse.json({message:e instanceof z.ZodError?'请核对题干、答案与解析':e instanceof Error?e.message:'添加失败，请重试'},{status:400});}
}
