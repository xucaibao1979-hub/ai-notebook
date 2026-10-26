import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {getAIService} from '@/lib/ai';
import type {LearningExercise} from '@/lib/learning';
import {z} from 'zod';
import {curriculumBrief} from '@/lib/study-preferences';
import {modelErrorMessage} from '@/lib/ai/error-message';
import {generateExercises} from '@/lib/learning-service';
import {learningRequestSchema} from '@/lib/learning';
const schema=z.object({setId:z.string(),index:z.number().int().min(0),action:z.enum(['hint','grade','feedback','to-notebook','regenerate']),step:z.number().int().min(1).max(3).default(1),message:z.string().trim().max(2000).default('')});
export async function POST(req:Request){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
 try{
  const body=schema.parse(await req.json());const userId=session.user.id;
  const set=await prisma.learningSet.findFirst({where:{id:body.setId,userId,archivedAt:null}});if(!set)return NextResponse.json({message:'练习不存在'},{status:404});
  const questions=JSON.parse(set.questions) as (LearningExercise&{feedback?:{date:string;message:string}[]})[];
  const q=questions[body.index];if(!q||JSON.parse(set.deletedIndices).includes(body.index))return NextResponse.json({message:'题目不存在'},{status:404});
  const record=await prisma.practiceRecord.findUnique({where:{userId_learningSetId_exerciseIndex:{userId,learningSetId:set.id,exerciseIndex:body.index}}});
  if(body.action==='regenerate'){
   const subject=q.subject||'其他';
   const request=learningRequestSchema.parse({mode:'ai',source:'ai',subject,count:1,knowledgePoint:q.knowledgePoints.join('、'),prompt:'请出一道新的同知识点练习，避免原题的问题：'+(q.feedback||[]).map(f=>f.message).join('；').slice(0,1000)});
   const questions=await generateExercises(userId,request);
   const fresh=await prisma.learningSet.create({data:{userId,source:'ai',title:subject+' · 重新生成',selectionKey:crypto.randomUUID(),questions:JSON.stringify(questions),parameters:JSON.stringify({...request,grade:questions[0].provenance.grade||''})}});
   return NextResponse.json({message:'新题已单独保存，原题和作答记录保留。',newSetId:fresh.id});
  }
  if(body.action==='feedback'){
   if(!body.message)return NextResponse.json({message:'请填写具体问题'},{status:400});q.feedback=[...(q.feedback||[]),{date:new Date().toISOString(),message:body.message}];
   const changed=await prisma.learningSet.updateMany({where:{id:set.id,userId,questions:set.questions},data:{questions:JSON.stringify(questions)}});if(!changed.count)return NextResponse.json({message:'题目已更新，请刷新后重试'},{status:409});
   return NextResponse.json({message:'反馈已保存到该题记录中，可在练习历史中查看。'});
  }
  if(body.action==='to-notebook'){
   if(!record||record.isCorrect!==false)return NextResponse.json({message:'请先提交作答并标记为还需练习'},{status:400});
   const source=`练习回流:${set.id}:${body.index}`;
   const item=await prisma.$transaction(async tx=>{const existing=await tx.errorItem.findFirst({where:{userId,source}});if(existing)return existing;const subject=await tx.subject.upsert({where:{name_userId:{name:q.subject,userId}},create:{name:q.subject,userId},update:{}});const tags=[];for(const name of q.knowledgePoints){let tag=await tx.knowledgeTag.findFirst({where:{userId,name,subject:q.subject}});if(!tag)tag=await tx.knowledgeTag.create({data:{userId,name,subject:q.subject,isSystem:false}});tags.push({id:tag.id});}return tx.errorItem.create({data:{userId,subjectId:subject.id,originalImageUrl:'',questionText:q.questionText+(q.options?'\n'+q.options.map((o,i)=>String.fromCharCode(65+i)+'. '+o).join('\n'):''),answerText:q.answerText||q.answerHtml?.replace(/<[^>]*>/g,' '),analysis:q.analysis,wrongAnswerText:record.userAnswer,mistakeStatus:'wrong_attempt',gradeSemester:q.provenance.grade,source,userNotes:`原练习：${set.title}\n来源：${q.provenance.name}\n${q.provenance.url||''}`,tags:{connect:tags},reviewSchedules:{create:{scheduledFor:new Date(Date.now()+86400000)}}}});});
   return NextResponse.json({message:'已加入错题本，并安排明天复习',id:item.id});
  }
  if(body.action==='grade'&&!record?.userAnswer)return NextResponse.json({message:'请先提交作答'},{status:400});
  const profile=await prisma.user.findUnique({where:{id:userId},select:{studyPreferences:true}});
  const curriculum=curriculumBrief(profile?.studyPreferences,q.subject);
  const ai=getAIService('review',userId);
  const prompt=body.action==='hint'?`只给第 ${body.step} 步提示，不提供最终答案。第1步指出相关概念，第2步给思路，第3步给中间步骤。`:`按解题步骤指出正确部分、错误位置和改进建议，不直接改动掌握状态；无法判断时明确说明。学生答案：${record?.userAnswer}`;
  const result=await ai.reanswerQuestion(`${curriculum}\n${prompt}\n题目：${q.questionText}\n${(q.options||[]).join('\n')}\n参考答案：${q.answerText}\n参考解析：${q.analysis}`,'zh',q.subject);
  return NextResponse.json({text:result.analysis||result.answerText});
 }catch(e){return NextResponse.json({message:e instanceof z.ZodError?'操作参数无效':modelErrorMessage(e)},{status:502});}
}
