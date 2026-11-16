import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { modelErrorMessage } from '@/lib/ai/error-message';
import { catalogPhotoImagesSchema, recognizeCatalogPhotos } from '@/app/api/study-catalog/photo/route';
import { learningRequestSchema } from '@/lib/learning';
import { getOrCreateLearningSet, learningSetForClient, LearningError } from '@/lib/learning-service';

export const maxDuration = 300;

async function runTask(id: string) {
    const claimed = await prisma.studyTask.updateMany({ where: { id, status: 'pending' }, data: { status: 'running', phase: '正在准备', progress: 5, error: null } });
    if (!claimed.count) return;
    const task = await prisma.studyTask.findUnique({ where: { id } });
    if (!task) return;
    const heartbeat = setInterval(() => { void prisma.studyTask.updateMany({ where: { id, status: 'running' }, data: { updatedAt: new Date() } }).catch(() => {}); }, 15_000);
    heartbeat.unref?.();
    try {
        const input = JSON.parse(task.input);
        const result = task.kind === 'catalog-photo'
            ? await recognizeCatalogPhotos(catalogPhotoImagesSchema.parse(input).images, task.userId, (done,total) => { void prisma.studyTask.updateMany({where:{id,status:'running'},data:{phase:`已处理 ${done}/${total} 张`,progress:Math.min(90,Math.round(10+done/total*80))}}).catch(() => {}); })
            : learningSetForClient(await getOrCreateLearningSet(task.userId, learningRequestSchema.parse(input.request), stage => { void prisma.studyTask.updateMany({where:{id,status:'running'},data:{phase:stage,progress:Math.min(85,stage.includes('校验')?75:stage.includes('出题')?35:15)}}).catch(() => {}); }));
        await prisma.studyTask.update({ where: { id }, data: { status: 'succeeded', phase: '已完成', progress: 100, result: JSON.stringify(result), input: '', error: null } });
    } catch (error) {
        await prisma.studyTask.update({ where: { id }, data: { status: 'failed', phase: '失败，可重试', error: error instanceof LearningError ? error.message : modelErrorMessage(error) } });
    } finally { clearInterval(heartbeat); }
}

function publicTask(task: { id: string; kind: string; status: string; phase: string; progress: number; result: string | null; error: string | null; createdAt: Date; updatedAt: Date }) {
    return { id: task.id, kind: task.kind, status: task.status, phase: task.phase, progress: task.progress, result: task.result ? JSON.parse(task.result) : null, error: task.error, createdAt: task.createdAt, updatedAt: task.updatedAt };
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
        const kind = new URL(request.url).searchParams.get('kind');
        const items = await prisma.studyTask.findMany({ where: { userId: session.user.id, ...(kind === 'catalog-photo' || kind === 'exercise' ? { kind } : {}) }, orderBy: { createdAt: 'desc' }, take: 20 });
        return NextResponse.json({ items: items.map(publicTask) });
    }
    let task = await prisma.studyTask.findFirst({ where: { id, userId: session.user.id } });
    if (!task) return NextResponse.json({ message: '任务不存在' }, { status: 404 });
    if (task.status === 'running' && Date.now() - task.updatedAt.getTime() > 90_000 && task.input) {
        await prisma.studyTask.updateMany({ where: { id, status: 'running', updatedAt: task.updatedAt }, data: { status: 'pending', phase: '任务中断，正在恢复', error: '上次执行中断，正在重新执行。' } });
        task = await prisma.studyTask.findUniqueOrThrow({ where: { id } });
    }
    if (task.status === 'pending') void runTask(task.id).catch(error => console.error('[study-task]', error));
    return NextResponse.json(publicTask(task));
}

export async function PATCH(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const body = z.object({ id: z.string().min(1) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ message: '任务编号无效' }, { status: 400 });
    const row = await prisma.studyTask.findFirst({where:{id:body.data.id,userId:session.user.id}});
    if (!row || row.status !== 'failed' || !row.input) return NextResponse.json({ message: '任务无法重试' }, { status: 409 });
    await prisma.studyTask.update({where:{id:row.id},data:{status:'pending',phase:'等待重试',progress:0,error:null}});
    void runTask(row.id).catch(error => console.error('[study-task]', error));
    return NextResponse.json({ok:true,id:row.id});
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const parsed = z.discriminatedUnion('kind', [z.object({ kind: z.literal('catalog-photo'), images: catalogPhotoImagesSchema.shape.images }), z.object({ kind: z.literal('exercise'), request: learningRequestSchema })]).safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: '任务参数无效，请核对照片或出题条件' }, { status: 400 });
    const input = parsed.data.kind === 'catalog-photo' ? JSON.stringify({ images: parsed.data.images }) : JSON.stringify({ request: parsed.data.request });
    const requestHash = createHash('sha256').update(input).digest('hex');
    const existing = await prisma.studyTask.findFirst({ where: { userId: session.user.id, kind: parsed.data.kind, requestHash, status: { in: ['pending', 'running'] } }, orderBy: { createdAt: 'desc' } });
    if (existing) {
        if (existing.status === 'pending') void runTask(existing.id).catch(error => console.error('[study-task]', error));
        return NextResponse.json(publicTask(existing));
    }
    const task = await prisma.studyTask.create({ data: { userId: session.user.id, kind: parsed.data.kind, requestHash, input } });
    void runTask(task.id).catch(error => console.error('[study-task]', error));
    return NextResponse.json(publicTask(task), { status: 202 });
}
