import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {authOptions} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {studyPreferences,curriculumSummary} from '@/lib/study-preferences';
import {recommendationScore} from '@/lib/recommendation';
import {learningDateKey,LearningExercise} from '@/lib/learning';
export async function GET(){
 const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});const userId=session.user.id;
 const [user,errors,records]=await Promise.all([prisma.user.findUniqueOrThrow({where:{id:userId}}),prisma.errorItem.findMany({where:{userId,archivedAt:null},include:{tags:true,subject:true,reviewSchedules:true}}),prisma.practiceRecord.findMany({where:{userId,OR:[{learningSetId:null},{learningSet:{archivedAt:null}}]},include:{learningSet:true},orderBy:{createdAt:'asc'}})]);
 const today=learningDateKey();const prefs=studyPreferences(user.studyPreferences);const budget=Math.max(1,Math.floor(prefs.dailyMinutes/5));
 const tasks=errors.filter(e=>e.masteryLevel<2&&e.questionText&&!e.reviewSchedules.some(s=>s.completedAt&&learningDateKey(s.completedAt)===today)).map(e=>({...e,...recommendationScore(e)})).sort((a,b)=>b.score-a.score).slice(0,Math.min(5,budget));
 const completedToday=errors.filter(e=>e.reviewSchedules.some(s=>s.completedAt&&learningDateKey(s.completedAt)===today)).length;
 const points=new Map<string,{name:string;errors:number;mastered:number;reviewWrong:number}>();const causes=new Map<string,number>();
 for(const e of errors){if(e.errorType)causes.set(e.errorType,(causes.get(e.errorType)||0)+1);for(const tag of e.tags){const p=points.get(tag.name)||{name:tag.name,errors:0,mastered:0,reviewWrong:0};p.errors++;if(e.masteryLevel===2)p.mastered++;p.reviewWrong+=e.reviewSchedules.filter(r=>r.isCorrect===false).length;points.set(tag.name,p);}}
 const objective={correct:0,total:0},self={correct:0,total:0};let unknown=0;
 const trend:Record<string,{date:string;total:number;correct:number}>= {};
 for(const r of records){if(r.isCorrect===null)continue;const q=r.learningSet&&r.exerciseIndex!==null?(JSON.parse(r.learningSet.questions) as LearningExercise[])[r.exerciseIndex]:null;const group=q?.correctOption?objective:q?self:null;if(group){group.total++;if(r.isCorrect)group.correct++;}else unknown++;const date=learningDateKey(r.createdAt);const point=trend[date]||{date,total:0,correct:0};point.total++;if(r.isCorrect)point.correct++;trend[date]=point;}
 const reviews=errors.flatMap(e=>e.reviewSchedules).filter(r=>r.completedAt&&r.isCorrect!==null);
 return NextResponse.json({dailyMinutes:prefs.dailyMinutes,completedToday,tasks:tasks.map(e=>({id:e.id,subject:e.subject?.name||'未分类',questionText:e.questionText,answerText:e.answerText,analysis:e.analysis,reason:e.reason,curriculum:curriculumSummary(user.studyPreferences,e.subject?.name),knowledgePoints:e.tags.map(t=>t.name)})),recommendedCount:Math.min(5,Math.max(1,budget-tasks.length)),knowledgePoints:[...points.values()].sort((a,b)=>(b.errors-b.mastered+b.reviewWrong)-(a.errors-a.mastered+a.reviewWrong)).slice(0,10),causes:[...causes].map(([name,count])=>({name,count})),objective,self,unknown,review:{total:reviews.length,correct:reviews.filter(r=>r.isCorrect).length},trend:Object.values(trend).slice(-14)});
}
