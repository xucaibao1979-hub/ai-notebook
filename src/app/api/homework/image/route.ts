import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decodeSavedHomeworkImage } from '@/lib/homework-image';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ message: '缺少记录编号' }, { status: 400 });
    const review = await prisma.homeworkReview.findFirst({ where: { id, userId: session.user.id }, select: { image: true } });
    if (!review) return NextResponse.json({ message: '批改记录不存在' }, { status: 404 });
    const image = decodeSavedHomeworkImage(review.image);
    if (!image) return NextResponse.json({ message: '原图不可用' }, { status: 404 });
    return new Response(new Uint8Array(image.bytes), { headers: { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
}
