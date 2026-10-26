import {describe,it,expect,vi} from 'vitest';
import {structuralIssues,validateExercise,parseReviewVerdict} from '@/lib/exercise-validation';
import {usableForRecommendation,questionQualityState} from '@/lib/paper-quality';
import {correctReviewDays,nextReviewDays} from '@/lib/review-plan';
import {recommendationScore} from '@/lib/recommendation';
import {studyPreferences,curriculumBrief} from '@/lib/study-preferences';
const mocks=vi.hoisted(()=>({review:vi.fn()}));
vi.mock('@/lib/ai',()=>({getAIService:()=>({reanswerQuestion:mocks.review})}));
describe('quality gate and curriculum',()=>{
 it('excludes missing diagrams and missing independent answers',()=>{const q={number:'1',questionHtml:'如图，求角度',answerHtml:'30°',grade:7,gradeBasis:'test',knowledgePoints:[]};expect(usableForRecommendation(q)).toBe(false);expect(questionQualityState(q)).toBe('资料缺失');expect(usableForRecommendation({...q,questionHtml:'计算 1+1',answerHtml:''})).toBe(false);});
 it('distinguishes reviewed and unverified complete questions',()=>{const q={number:'1',questionHtml:'1+1=?',answerHtml:'2',grade:null,gradeBasis:'test',knowledgePoints:[]};expect(questionQualityState(q)).toBe('待核验');expect(questionQualityState({...q,locallyReviewed:true})).toBe('已校对');});
 it('rejects incomplete AI questions before review',()=>expect(structuralIssues({questionText:'如图',answerText:'2',analysis:''})).toHaveLength(2));
 it('requires an explicit valid reviewer decision',async()=>{const q={questionText:'1+1=?',answerText:'3',analysis:'相加',subject:'数学',knowledgePoints:[],difficulty:'easy',provenance:{name:'AI'}};mocks.review.mockResolvedValue({answerText:'{"valid":false,"reason":"答案错误"}'});await expect(validateExercise(q,'小学一年级','加法','u')).rejects.toThrow('答案错误');mocks.review.mockResolvedValue({answerText:'判断不明确'});await expect(validateExercise(q,'小学一年级','加法','u')).rejects.toThrow('有效审核结果');});
 it('parses an explicit JSON review even when fenced, without accepting prose',()=>{expect(parseReviewVerdict('```json\n{"valid":true,"reason":"独立验算正确"}\n```').valid).toBe(true);expect(()=>parseReviewVerdict('答案大概正确')).toThrow('有效审核结果');});
 it('adds explicit textbook semester and chapter constraints',()=>{const raw=JSON.stringify({textbook:'人教版',semester:'上学期',chapter:'分数',dailyMinutes:15});expect(curriculumBrief(raw)).toContain('分数');expect(curriculumBrief(raw)).toContain('人教版');expect(studyPreferences(raw).dailyMinutes).toBe(15);});
});
describe('review scheduling',()=>{
 it('counts independent dates rather than multiple marks on the same day',()=>{const records=[{completedAt:new Date('2026-10-10T02:00:00Z'),isCorrect:true},{completedAt:new Date('2026-10-10T01:00:00Z'),isCorrect:true},{completedAt:new Date('2026-10-09T01:00:00Z'),isCorrect:true}];expect(correctReviewDays(records)).toBe(2);});
 it('stops a correct streak at the latest wrong result',()=>expect(correctReviewDays([{completedAt:new Date('2026-10-10'),isCorrect:false},{completedAt:new Date('2026-10-09'),isCorrect:true}])).toBe(0));
 it('brings failed reviews back tomorrow and spaces successful reviews',()=>{expect(nextReviewDays(false,4)).toBe(1);expect(nextReviewDays(true,2)).toBe(7);});
 it('prioritizes overdue unmastered errors',()=>{const now=new Date('2026-10-10');const due={masteryLevel:0,createdAt:new Date('2026-10-01'),reviewSchedules:[{scheduledFor:new Date('2026-10-09'),completedAt:null,isCorrect:null}]};const mastered={...due,masteryLevel:2,reviewSchedules:[]};expect(recommendationScore(due,now).score).toBeGreaterThan(recommendationScore(mastered,now).score);expect(recommendationScore(due,now).reason).toContain('复习时间');});
});
