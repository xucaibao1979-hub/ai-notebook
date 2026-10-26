import {learningDateKey} from './learning';
export function correctReviewDays(records:{completedAt:Date|null;isCorrect:boolean|null}[]){
 const days=new Set<string>();
 for(const r of records.filter(r=>r.completedAt&&r.isCorrect!==null).sort((a,b)=>b.completedAt!.getTime()-a.completedAt!.getTime())){if(r.isCorrect!==true)break;days.add(learningDateKey(r.completedAt!));}
 return days.size;
}
export function nextReviewDays(correct:boolean,streak:number){return correct?[1,3,7,14,30][Math.min(streak,4)]:1;}
