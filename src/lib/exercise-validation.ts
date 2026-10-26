import { z } from 'zod';
import { getAIService } from './ai';
import type { LearningExercise } from './learning';
export function structuralIssues(q: Pick<LearningExercise,'questionText'|'answerText'|'analysis'>) {
    const issues:string[]=[];
    if(!q.questionText.trim()||!q.answerText?.trim()||!q.analysis?.trim())issues.push('题干、答案或解析不完整');
    if(/如图|下图|上图|图中/.test(q.questionText)&&!q.questionText.includes('!['))issues.push('题干依赖未提供的图片');
    return issues;
}
const verdict=z.object({valid:z.boolean(),reason:z.string()});
export function parseReviewVerdict(raw: string) {
    const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('校验模型未返回有效审核结果');
    try { return verdict.parse(JSON.parse(text.slice(start, end + 1))); }
    catch { throw new Error('校验模型未返回有效审核结果'); }
}
export async function validateExercise(q:LearningExercise,grade:string,curriculum:string,userId:string){
    const local=structuralIssues(q);if(local.length)throw new Error(local.join('；'));
    const ai=getAIService('review',userId);
    const instructions=`独立解题后审核以下${grade}${q.subject}题。检查条件是否充分、答案是否正确、解析是否一致、是否依赖缺失的图片或资料，以及是否符合以下学习范围：${curriculum}。不能确认正确时 valid=false。只返回 {"valid":true或false,"reason":"具体原因"}。\n题干：${q.questionText}\n参考答案：${q.answerText}\n参考解析：${q.analysis}`;
    const raw=ai.reviewExercise ? await ai.reviewExercise(instructions) : (await ai.reanswerQuestion(instructions,'zh',q.subject,undefined,grade)).answerText;
    const check=parseReviewVerdict(raw);if(!check.valid)throw new Error(check.reason||'题目未通过校验');
    return {status:'ai-reviewed' as const,note:check.reason};
}
