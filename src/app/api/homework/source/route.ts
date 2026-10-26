import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {hasSavedHomeworkImage} from '@/lib/homework-image';

export async function GET(req:Request){
  const session=await getServerSession(authOptions);
  if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
  const itemId=new URL(req.url).searchParams.get('itemId')||'';
  if(!itemId)return NextResponse.json({message:'缺少错题编号'},{status:400});
  const item=await prisma.errorItem.findFirst({where:{id:itemId,userId:session.user.id},select:{source:true}});
  const match=item?.source?.match(/^homework(?:-manual)?:([^:]+):\d+$/);
  if(!match)return NextResponse.json({message:'该题没有拍照来源'},{status:404});
  const review=await prisma.homeworkReview.findFirst({where:{id:match[1],userId:session.user.id},select:{image:true,createdAt:true}});
  if(!review || !hasSavedHomeworkImage(review.image))return NextResponse.json({message:'来源图片尚未保存或已损坏'},{status:404});
  return NextResponse.json({image:review.image,uploadedAt:review.createdAt.toISOString()},{headers:{'Cache-Control':'private, no-store'}});
}
