import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EXAM_SUBJECTS } from '@/lib/knowledge-library';
import type { Prisma } from '@prisma/client';
import { paperQuality } from '@/lib/paper-quality';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const params = new URL(req.url).searchParams;
    const page = Math.max(1, Number(params.get('page')) || 1);
    const yearValue = (params.get('year') || '').trim();
    const year = Number(yearValue);
    if(yearValue && (!/^\d{4}$/.test(yearValue)||year<1900||year>new Date().getFullYear()))return NextResponse.json({message:'请输入 1900 年至当前年份的四位年份'},{status:400});
    const subject = params.get('subject') || '';
    const exam = params.get('exam') || '';
    const examGrade = Number(params.get('examGrade'));
    const knowledgeGrade = params.get('knowledgeGrade') || '';
    const search = (params.get('search') || '').trim().slice(0, 100);
    const region = (params.get('region') || '').slice(0, 100);
    const source=(params.get('source')||'').slice(0,100);
    const format=params.get('format');
    const where: Prisma.KnowledgePaperWhereInput = {
        ...(!!yearValue ? { year } : {}),
        ...(EXAM_SUBJECTS.includes(subject as typeof EXAM_SUBJECTS[number]) ? { subject } : {}),
        ...(['zhongkao', 'gaokao'].includes(exam) ? { examType: exam } : {}),
        ...([7, 8, 9, 10, 11, 12].includes(examGrade) ? { examGrade } : {}),
        ...(source?{sourceName:source}:{}),
        ...(format==='images'?{status:'image_original'}:format==='questions'?{questionCount:{gt:0}}:{}),
        ...(region ? { region } : {}),
        ...(['7', '8', '9', '10', '11', '12'].includes(knowledgeGrade) ? { knowledgeGrades: { contains: knowledgeGrade } } : knowledgeGrade === 'unknown' ? { questions: { contains: '"grade":null' } } : {}),
        ...(search ? { OR: [{ title: { contains: search } }, { region: { contains: search } }] } : {}),
    };
    const [total, papers, subjects, years, regions, aggregate, sources, errors, learningSets] = await Promise.all([
        prisma.knowledgePaper.count({ where }),
        prisma.knowledgePaper.findMany({ where, skip: (page - 1) * 12, take: 12, orderBy: [{ year: 'desc' }, { title: 'asc' }], select: { id: true, title: true, year: true, examType: true, subject: true, region: true, examGrade: true, questionCount: true, answerCount: true, sourceName: true, sourceUrl: true, status: true, qualityNote: true, knowledgeGrades: true, fetchedAt: true } }),
        prisma.knowledgePaper.groupBy({ by: ['subject'], _count: { id: true } }),
        prisma.knowledgePaper.groupBy({ by: ['year', 'examType'], _count: { id: true } }),
        prisma.knowledgePaper.groupBy({ by: ['region'], orderBy: { region: 'asc' } }),
        prisma.knowledgePaper.aggregate({ _count: { id: true }, _sum: { questionCount: true, answerCount: true } }),
        prisma.knowledgePaper.groupBy({by:['sourceName'],_count:{id:true}}),
        prisma.errorItem.count({where:{userId:session.user.id,archivedAt:null}}),
        prisma.learningSet.findMany({where:{userId:session.user.id,archivedAt:null},select:{questions:true,deletedIndices:true}}),
    ]);
    const historyExercises = learningSets.reduce((count, set) => {
        try {
            const questions: unknown = JSON.parse(set.questions);
            if (!Array.isArray(questions)) return count;
            const deleted: unknown = JSON.parse(set.deletedIndices);
            const removed = new Set(Array.isArray(deleted) ? deleted.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < questions.length) : []);
            return count + questions.length - removed.size;
        } catch { return count; }
    }, 0);
    const questionData = await prisma.knowledgePaper.findMany({ where: { id: { in: papers.map(paper => paper.id) } }, select: { id: true, questions: true } });
    const imageMap=new Map(questionData.map(p=>{const qs=JSON.parse(p.questions) as {questionHtml:string;answerHtml:string}[];return [p.id,{imagePageCount:qs.reduce((n,q)=>n+(q.questionHtml.match(/<img\b/g)||[]).length,0),answerPageCount:qs.reduce((n,q)=>n+(q.answerHtml.match(/<img\b/g)||[]).length,0)}];}));
    const qualityMap = new Map(questionData.map(paper => [paper.id, paperQuality(JSON.parse(paper.questions))]));
    return NextResponse.json({sources:sources.map(s=>({name:s.sourceName,count:s._count.id})), total, page, pageSize: 12, papers: papers.map(paper => ({ ...paper, ...imageMap.get(paper.id), quality: qualityMap.get(paper.id), knowledgeGrades: JSON.parse(paper.knowledgeGrades) })), subjects: subjects.map(item => ({ subject: item.subject, count: item._count.id })), years: years.map(item => ({ year: item.year, examType: item.examType, count: item._count.id })), regions: regions.map(item => item.region), summary: { papers: aggregate._count.id, questions: aggregate._sum.questionCount || 0, answers: aggregate._sum.answerCount || 0, errors, historyExercises }, coverage: '已收录公开目录资料，尚未覆盖全国全部省市试卷；原卷身份和质量以来源及核验状态为准。' });
}
