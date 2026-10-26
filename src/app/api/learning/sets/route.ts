import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { learningRequestSchema, learningDateKey } from '@/lib/learning';
import { getOrCreateLearningSet, learningSetForClient, LearningError } from '@/lib/learning-service';
import { currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';

export const maxDuration = 300;

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const params = new URL(req.url).searchParams;
    const student = await prisma.user.findUnique({ where: { id: session.user.id }, select: { currentGrade: true, educationStage: true, enrollmentYear: true } });
    const grade = currentStudentGrade(student || {});
    const set = await prisma.learningSet.findFirst({
        where: { userId: session.user.id, archivedAt:null, ...(params.get('id') ? { id: params.get('id')! } : { dateKey: params.get('mode') === 'daily' ? learningDateKey() : null, ...(params.get('mode') === 'ai' ? { source: 'ai' } : {}), ...(grade ? { parameters: { contains: `"grade":${JSON.stringify(STUDENT_GRADES[grade])}` } } : {}) }) },
        orderBy: { createdAt: 'desc' }, include: { records: true },
    });
    return NextResponse.json(set ? learningSetForClient(set) : null);
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    try {
        const request = learningRequestSchema.parse(await req.json());
        if(new URL(req.url).searchParams.get('stream')==='1'){
            const userId=session.user.id; const encoder=new TextEncoder();
            const stream=new ReadableStream({async start(controller){
                const send=(event:unknown)=>{try{controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));}catch{}};
                try{send({stage:'准备练习'});const set=await getOrCreateLearningSet(userId,request,stage=>send({stage}));send({result:learningSetForClient(set)});}catch(e){send({error:e instanceof Error?e.message:'出题失败，请重试'});}finally{try{controller.close();}catch{}}
            }});
            return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-cache'}});
        }
        const set = await getOrCreateLearningSet(session.user.id, request);
        return NextResponse.json(learningSetForClient(set));
    } catch (error) {
        if (error instanceof z.ZodError) return NextResponse.json({ message: error.issues[0].message }, { status: 400 });
        if (error instanceof LearningError) return NextResponse.json({ message: error.message }, { status: error.status });
        const message = error instanceof Error && /AI_AUTH_ERROR/.test(error.message)
            ? 'AI 密钥无效，请在设置中检查配置。'
            : error instanceof Error && /公开题库/.test(error.message) ? error.message : '出题失败，请检查 AI 服务或网络连接后重试。';
        console.error('[learning] generation failed', error instanceof Error ? error.message : 'Unknown error');
        return NextResponse.json({ message }, { status: 502 });
    }
}
