import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {generateExercises,learningSetForClient} from '@/lib/learning-service';
import {learningRequestSchema} from '@/lib/learning';
export const maxDuration=300;
export async function POST(req:Request){
 const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 try{const {setId}=await req.json();const set=await prisma.learningSet.findFirst({where:{id:setId,userId:s.user.id,archivedAt:null},include:{records:true}});if(!set)return NextResponse.json({message:'练习不存在'},{status:404});const request=learningRequestSchema.parse(JSON.parse(set.parameters));const existing=JSON.parse(set.questions);const count=request.count-existing.length;if(count<=0)return NextResponse.json(learningSetForClient(set));const generated=await generateExercises(s.user.id,{...request,count});const questions=[...existing,...generated.filter(q=>!existing.some((old:{questionText:string})=>old.questionText===q.questionText))];const result=await prisma.learningSet.updateMany({where:{id:set.id,userId:s.user.id,questions:set.questions,archivedAt:null},data:{questions:JSON.stringify(questions)}});if(!result.count)return NextResponse.json({message:'练习已变化，请刷新重试'},{status:409});return NextResponse.json(learningSetForClient({...set,questions:JSON.stringify(questions)}));}catch(e){return NextResponse.json({message:e instanceof Error?e.message:'补题失败'},{status:502});}
}
