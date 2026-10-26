import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {z} from 'zod';
const schema=z.object({favorited:z.boolean().optional(),exerciseIndex:z.number().int().min(0).optional(),deleted:z.boolean().optional(),restore:z.boolean().optional()});
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 const {id}=await params;const parsed=schema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({message:'操作参数无效'},{status:400});
 const set=await prisma.learningSet.findFirst({where:{id,userId:session.user.id}});if(!set)return NextResponse.json({message:'练习不存在'},{status:404});
 if(parsed.data.restore){await prisma.learningSet.updateMany({where:{id,userId:session.user.id},data:{archivedAt:null}});return NextResponse.json({success:true});}
 const {exerciseIndex,favorited,deleted}=parsed.data;
 const favorites=new Set<number>(JSON.parse(set.favoriteIndices));const hidden=new Set<number>(JSON.parse(set.deletedIndices));
 if(exerciseIndex!==undefined){if(exerciseIndex>=JSON.parse(set.questions).length)return NextResponse.json({message:'题目不存在'},{status:400});if(favorited!==undefined){if(favorited)favorites.add(exerciseIndex);else favorites.delete(exerciseIndex);}if(deleted!==undefined){if(deleted){hidden.add(exerciseIndex);favorites.delete(exerciseIndex);}else hidden.delete(exerciseIndex);}}
 else if(favorited===undefined)return NextResponse.json({message:'请选择题目或收藏操作'},{status:400});
 const result=await prisma.learningSet.updateMany({where:{id,userId:session.user.id,favoriteIndices:set.favoriteIndices,deletedIndices:set.deletedIndices},data:{...(exerciseIndex===undefined?{favorited}:{}),favoriteIndices:JSON.stringify([...favorites]),deletedIndices:JSON.stringify([...hidden])}});
 if(!result.count)return NextResponse.json({message:'练习已更新，请刷新后重试'},{status:409});
 return NextResponse.json({success:true});
}
export async function DELETE(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 const {id}=await params;
 const permanent=new URL(_req.url).searchParams.get('permanent')==='1';
 const result=permanent?await prisma.learningSet.deleteMany({where:{id,userId:session.user.id,archivedAt:{not:null}}}):await prisma.learningSet.updateMany({where:{id,userId:session.user.id},data:{archivedAt:new Date()}});
 return NextResponse.json({success:!!result.count});
}
