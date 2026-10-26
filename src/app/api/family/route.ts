import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {hash} from 'bcryptjs';
import {randomUUID} from 'crypto';
import {z} from 'zod';
import {gradeStage} from '@/lib/student-grade';
export async function GET(){const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});const accountId=s.user.accountId||s.user.id;const rows=await prisma.user.findMany({where:{isActive:true,OR:[{id:accountId},{parentUserId:accountId}]},select:{id:true,name:true,currentGrade:true,parentUserId:true},orderBy:{createdAt:'asc'}});return NextResponse.json({items:rows,activeId:s.user.id});}
export async function POST(req:Request){const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});const accountId=s.user.accountId||s.user.id;try{const body=z.object({name:z.string().trim().min(1).max(40),currentGrade:z.number().int().min(1).max(17)}).parse(await req.json());const count=await prisma.user.count({where:{parentUserId:accountId}});if(count>=10)return NextResponse.json({message:'最多支持 10 个家庭学习身份'},{status:400});const user=await prisma.user.create({data:{parentUserId:accountId,name:body.name,currentGrade:body.currentGrade,educationStage:gradeStage(body.currentGrade),email:'learner-'+randomUUID()+'@localhost',password:await hash(randomUUID(),10),role:'user'}});return NextResponse.json({id:user.id,name:user.name});}catch{return NextResponse.json({message:'请填写姓名和有效年级'},{status:400});}}

export async function DELETE(req:Request){
 const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 const accountId=s.user.accountId||s.user.id;
 try{const {id}=z.object({id:z.string().min(1)}).parse(await req.json());if(id===accountId)return NextResponse.json({message:'主账户不能删除'},{status:400});
 const result=await prisma.user.updateMany({where:{id,parentUserId:accountId,isActive:true},data:{isActive:false}});
 if(!result.count)return NextResponse.json({message:'身份不存在或不属于当前家庭'},{status:404});return NextResponse.json({success:true});
 }catch{return NextResponse.json({message:'删除身份失败，请重试'},{status:400});}
}
