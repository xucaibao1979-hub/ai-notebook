import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {z} from 'zod';
export async function PATCH(req:Request){const s=await getServerSession(authOptions);if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});const parsed=z.object({id:z.string(),favorited:z.boolean().optional(),removed:z.boolean().optional()}).safeParse(await req.json());if(!parsed.success)return NextResponse.json({message:'参数无效'},{status:400});const {id,favorited,removed}=parsed.data;if(favorited===undefined&&removed===undefined)return NextResponse.json({message:'请选择收藏或移除操作'},{status:400});const result=await prisma.errorItem.updateMany({where:{id,userId:s.user.id},data:{...(favorited!==undefined?{favorited}:{}),...(removed!==undefined?{archivedAt:removed?new Date():null}:{})}});return result.count?NextResponse.json({success:true}):NextResponse.json({message:'错题不存在或无权访问'},{status:404});}
