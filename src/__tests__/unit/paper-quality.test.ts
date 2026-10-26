import { describe, it, expect } from 'vitest';
import { questionQuality, paperQuality } from '@/lib/paper-quality';
describe('specific paper quality issues', () => {
    const question = { number: '1', questionHtml: '<p>如图，求面积</p>', answerHtml: '', grade: 7, gradeBasis: '', knowledgePoints: [], answerLeakRisk: true };
    it('identifies answer hints, missing figures and missing answers separately', () => {
        const issues = questionQuality(question);
        expect(issues).toHaveLength(3);
        expect(issues.join(' ')).toContain('题图');
    });
    it('does not confuse hidden answers with missing source answers', () => {
        expect(questionQuality({ ...question, questionHtml: '<p>已知条件</p>', answerLeakRisk: false, hasAnswer: true })).toHaveLength(0);
    });
    it('keeps local review separate from official source verification', () => {
        const corrected = { ...question, correctedMarkdown: '已知长为 3，宽为 2 的矩形，求面积。', locallyReviewed: true, hasAnswer: true };
        expect(questionQuality(corrected)).toHaveLength(0);
        expect(paperQuality([corrected]).locallyReviewed).toBe(1);
    });
});
