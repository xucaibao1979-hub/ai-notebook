import {Prisma} from '@prisma/client';
import {HomeworkQuestion} from './homework';

export async function collectHomeworkQuestion(tx:Prisma.TransactionClient,userId:string,review:{id:string;image:string},index:number,q:HomeworkQuestion,gradeLabel:string|null,sourcePrefix='homework'){
  const source=`${sourcePrefix}:${review.id}:${index}`;
  const old=await tx.errorItem.findFirst({where:{userId,source}});
  const book=await tx.subject.upsert({where:{name_userId:{name:q.subject,userId}},create:{name:q.subject,userId},update:{}});
  const tags=[];
  for(const name of q.knowledgePoints){let tag=await tx.knowledgeTag.findFirst({where:{name,subject:q.subject,userId}});if(!tag)tag=await tx.knowledgeTag.create({data:{name,subject:q.subject,userId}});tags.push({id:tag.id});}
  const data={subjectId:book.id,questionText:`第 ${q.number} 题\n${q.questionText}`,answerText:q.answerText,analysis:q.analysis,wrongAnswerText:q.studentAnswer,mistakeStatus:q.judgement==='wrong'?'wrong_attempt':'not_attempted',gradeSemester:gradeLabel,archivedAt:null,solutionReviewedAt:null,tags:{set:tags}};
  if(old)return tx.errorItem.update({where:{id:old.id},data});
  return tx.errorItem.create({data:{...data,tags:{connect:tags},userId,source,originalImageUrl:review.image,reviewSchedules:{create:{scheduledFor:new Date(Date.now()+86400000)}}}});
}
