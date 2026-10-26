import type { LibraryQuestion } from './knowledge-library';
export function questionQuality(question: LibraryQuestion) {
    const issues: string[] = [];
    if (question.wholePaper) issues.push('保留整卷原文，尚未逐题拆分');
    if (question.answerLeakRisk && !question.locallyReviewed) issues.push('题干可能混入答案提示，已默认折叠');
    if (/如图|下图|图中|图示|下列图形|图形中|阴影部分/.test(question.correctedMarkdown || question.questionHtml) && !/<img\b|<svg\b/.test(question.questionHtml) && !question.correctedMarkdown?.includes('![')) issues.push('题目引用图形，但正文未检测到题图，请核对来源附件');
    if (!question.answerHtml && !question.correctedAnswerMarkdown && !question.hasAnswer) issues.push('缺少可独立提取的答案');
    return issues;
}
export function paperQuality(questions: LibraryQuestion[]) {
    return { issues: questions.filter(question => questionQuality(question).length > 0).length, locallyReviewed: questions.filter(question => question.locallyReviewed).length, total: questions.length };
}
export function questionQualityState(question: LibraryQuestion) {
    if(question.wholePaper&&/<img\b/.test(question.questionHtml))return '整卷图片 · 尚未拆题';
    if(questionQuality(question).length) return '资料缺失';
    return question.locallyReviewed ? '已校对' : '待核验';
}
export function usableForRecommendation(question: LibraryQuestion) {
    return !question.wholePaper && !question.answerLeakRisk && !!(question.answerHtml||question.correctedAnswerMarkdown) && questionQuality(question).length === 0;
}
