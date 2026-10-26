export function recommendationScore(item:{masteryLevel:number;createdAt:Date;reviewSchedules:{scheduledFor:Date;completedAt:Date|null;isCorrect:boolean|null}[]},now=new Date()){
    const due=(item.reviewSchedules||[]).some(s=>!s.completedAt&&s.scheduledFor<=now);
    const wrong=(item.reviewSchedules||[]).filter(s=>s.isCorrect===false).length;
    const recent=now.getTime()-item.createdAt.getTime()<7*86400000;
    const score=(due?100:0)+wrong*20+(item.masteryLevel<2?30:0)+(recent?10:0);
    return {score,reason:[due?'已到复习时间':'',wrong?`复习答错 ${wrong} 次`:'',item.masteryLevel<2?'尚未掌握':'',recent?'最近一周错题':''].filter(Boolean).join(' · ')||'巩固已学知识'};
}
