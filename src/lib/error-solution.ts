import {prisma} from './prisma';
import {getAIService} from './ai';
import {curriculumBrief} from './study-preferences';
import {currentStudentGrade,STUDENT_GRADES} from './student-grade';
import fs from 'fs/promises';
import path from 'path';
const pending=new Map<string,Promise<{answerText:string;analysis:string}>>();
export async function prepareErrorSolution(userId:string,id:string,force=false){
    const key=userId+':'+id;if(pending.has(key))return pending.get(key)!;
    const work=(async()=>{
        const item=await prisma.errorItem.findFirst({where:{id,userId,archivedAt:null},include:{subject:true}});
        if(!item)throw new Error('错题不存在或已移除，请先恢复错题');
        if(!item.questionText?.trim())throw new Error('请先识别并确认原题题干');
        if(!force&&item.solutionReviewedAt&&item.answerText?.trim()&&item.analysis?.trim())return {answerText:item.answerText,analysis:item.analysis};
        const user=await prisma.user.findUniqueOrThrow({where:{id:userId}});const grade=currentStudentGrade(user);
        let image=item.originalImageUrl.startsWith('data:image/')?item.originalImageUrl:undefined;
        if(!image&&/^\/(?:uploads|knowledge-assets)\/[\w./-]+$/.test(item.originalImageUrl)&&!item.originalImageUrl.includes('..')){const bytes=await fs.readFile(path.join(process.cwd(),'public',item.originalImageUrl));image='data:image/'+(item.originalImageUrl.endsWith('.png')?'png':'jpeg')+';base64,'+bytes.toString('base64');}
        if(!image&&/如图|下图|图中|阴影/.test(item.questionText))throw new Error('原题依赖题图，请补充清晰题图后再识别答案与出变式');
        const result=await getAIService('review',userId).reanswerQuestion(`先独立求解原错题，核对条件与答案，给出完整正确答案和逐步解题思路。不要将学生错误答案当作标准答案。无法确认时明确说明，不猜测。\n${curriculumBrief(user.studyPreferences,item.subject?.name)}\n原题：${item.questionText}`,'zh',item.subject?.name,image,grade?STUDENT_GRADES[grade]:item.gradeSemester);
        if(!result.answerText.trim()||!result.analysis.trim()||/^(无法确定|无法识别|看不清|缺少条件)/.test(result.answerText))throw new Error('未确认原题正确答案，请校对题干或补拍后重试');
        const changed=await prisma.errorItem.updateMany({where:{id,userId,questionText:item.questionText,answerText:item.answerText,analysis:item.analysis,originalImageUrl:item.originalImageUrl,archivedAt:null},data:{answerText:result.answerText,analysis:result.analysis,solutionReviewedAt:new Date()}});
        if(!changed.count)throw new Error('原题已变更，请重新确认后出题');return {answerText:result.answerText,analysis:result.analysis};
    })();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
