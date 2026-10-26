import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {getAppConfig,updateAppConfig} from '@/lib/config';
export async function GET(){const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});const rows=await prisma.aIUsage.findMany({where:{userId:s.user.id},orderBy:{createdAt:'desc'},take:100});return NextResponse.json({rows});}
export async function POST(){const s=await getServerSession(authOptions);if(s?.user?.role!=='admin')return NextResponse.json({message:'需要管理员权限'},{status:403});const config=getAppConfig();const id=config.backupInstanceId;if(!id||!config.openai?.instances?.some(i=>i.id===id))return NextResponse.json({message:'请先设置备用模型实例'},{status:400});updateAppConfig({aiProvider:'openai',openai:{...config.openai,activeInstanceId:id},taskModels:{analyze:id,generate:id,review:id,weekly:id}});return NextResponse.json({success:true});}
