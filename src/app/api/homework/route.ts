import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {getAIService} from '@/lib/ai';
import {HomeworkQuestion,homeworkInstructions,homeworkResultSchema} from '@/lib/homework';
import {curriculumSubject,studyPreferences} from '@/lib/study-preferences';
import {currentStudentGrade,STUDENT_GRADES} from '@/lib/student-grade';
import {modelErrorMessage} from '@/lib/ai/error-message';
import {z} from 'zod';
import {collectHomeworkQuestion} from '@/lib/homework-collection';
import {hasSavedHomeworkImage} from '@/lib/homework-image';

export const maxDuration=300;
const imageSchema=z.string().max(12_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/);

export async function GET(req:Request){
  const s=await getServerSession(authOptions);
  if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
  const id=new URL(req.url).searchParams.get('id');
  if(id){
    const r=await prisma.homeworkReview.findFirst({where:{id,userId:s.user.id}});
    const items=r?await prisma.errorItem.findMany({where:{userId:s.user.id,source:{startsWith:`homework:${r.id}:`}},select:{id:true,source:true,archivedAt:true}}):[];
    return r?NextResponse.json({...r,image:'',hasImage:hasSavedHomeworkImage(r.image),questions:JSON.parse(r.questions),scanQuestions:r.scanQuestions?JSON.parse(r.scanQuestions):undefined,collections:Object.fromEntries(items.map(i=>[Number(i.source!.split(':').pop()),{id:i.id,removed:!!i.archivedAt}]))}):NextResponse.json({message:'批改记录不存在'},{status:404});
  }
  const rows=await prisma.homeworkReview.findMany({where:{userId:s.user.id},orderBy:{createdAt:'desc'},take:100,select:{id:true,createdAt:true,image:true,questions:true,scanQuestions:true}});
  return NextResponse.json(rows.map(r=>{const questions:HomeworkQuestion[]=JSON.parse(r.scanQuestions||r.questions);return{id:r.id,createdAt:r.createdAt,hasImage:hasSavedHomeworkImage(r.image),count:questions.length,correct:questions.filter(q=>q.judgement==='correct').length,wrong:questions.filter(q=>q.judgement==='wrong').length};}));
}

function parseQuestions(text:string):HomeworkQuestion[]{
  try{
    const json=text.trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
    return homeworkResultSchema.parse(JSON.parse(json)).questions.map(q=>({...q,subject:curriculumSubject(q.subject)}));
  }catch{throw new Error('HOMEWORK_FORMAT');}
}

/** Adjacent bands overlap; merge the same section-qualified question number. */
export function mergeHomeworkQuestions(parts:HomeworkQuestion[][]):HomeworkQuestion[]{
  const merged=new Map<string,HomeworkQuestion>();
  for(const part of parts)for(const question of part){
    const number=question.number.replace(/\s+/g,'').toLowerCase();
    const key=number.includes('-')?number:`${number}:${question.questionText.replace(/\s+/g,'').slice(0,70).toLowerCase()}`;
    const old=merged.get(key);
    if(!old||old.judgement==='unclear'&&question.judgement!=='unclear'||old.questionText.length<question.questionText.length&&old.judgement===question.judgement)merged.set(key,question);
  }
  return [...merged.values()];
}

export async function POST(req:Request){
  const s=await getServerSession(authOptions);
  if(!s?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
  try{
    const body=z.object({image:imageSchema.optional(),images:z.array(imageSchema).min(1).max(2).optional(),uploadedAt:z.string().datetime().optional()}).refine(v=>!!v.image||!!v.images).parse(await req.json());
    const images=body.images||[body.image!];
    const user=await prisma.user.findUniqueOrThrow({where:{id:s.user.id}});
    const grade=currentStudentGrade(user);
    const instructions=homeworkInstructions+'\n按图片中每道题的内容分别判断科目；同一张图片可以有多个科目。教材版本参考：'+studyPreferences(user.studyPreferences).subjectTextbooks.map(row=>row.subject+'：'+(row.textbook||'未指定')).join('；');
    const service=getAIService('homework',s.user.id);
    const segments=await Promise.all(images.map(async(image,index)=>{
      const result=await service.analyzeImage(image.slice(image.indexOf(',')+1),image.match(/^data:([^;]+)/)![1],'zh',grade&&grade>=7&&grade<=12?grade as 7|8|9|10|11|12:null,'其他',grade?STUDENT_GRADES[grade]:null,instructions+(images.length>1?`\n这是整页的第 ${index+1}/${images.length} 段，与相邻段略有重叠。只列出本段题干起始行可见且内容完整的小题；大题编号必须保留。`:''));
      return parseQuestions(result.questionText);
    }));
    const scanQuestions=mergeHomeworkQuestions(segments);
    const wrong=scanQuestions.filter(q=>q.judgement==='wrong');
    const pendingQuestions=scanQuestions.filter(q=>q.judgement==='unclear');
    const transient={scanQuestions,pendingQuestions,totalQuestions:scanQuestions.length};
    const saved=await prisma.$transaction(async tx=>{
      const review=await tx.homeworkReview.create({data:{userId:s.user.id,image:body.image||images[0],questions:JSON.stringify(wrong),scanQuestions:JSON.stringify(scanQuestions),...(body.uploadedAt?{createdAt:new Date(body.uploadedAt)}:{})}});
      const collections:Record<number,{id:string;removed:boolean}>={};
      for(const [index,q] of wrong.entries()){
        const item=await collectHomeworkQuestion(tx,s.user.id,{id:review.id,image:''},index,q,grade?STUDENT_GRADES[grade]:null);
        collections[index]={id:item.id,removed:false};
      }
      return {...review,image:'',hasImage:true,questions:wrong,...transient,collections};
    },{timeout:30000});
    return NextResponse.json(saved);
  }catch(e){
    return NextResponse.json({message:e instanceof z.ZodError?'请选择有效作业图片':e instanceof Error&&e.message==='HOMEWORK_FORMAT'?'未取得完整的逐题批改结果，请分批或裁剪后重新拍摄。':e instanceof Error&&e.message==='AI_TIMEOUT_ERROR'?'拍照识别超过 60 秒仍无结果。请裁剪图片后重试，或在设置中切换拍照批改模型。':modelErrorMessage(e)},{status:502});
  }
}
