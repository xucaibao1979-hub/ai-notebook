import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { inferKnowledgeGrade, inferPaperMetadata } from '@/lib/knowledge-library';
const require = createRequire(import.meta.url);
const { parsePaperHtml, sanitizeHtml } = require('../../../scripts/library-parser.cjs');

describe('knowledge library source parsing', () => {
    it('separates original questions from answer/analysis sections', () => {
        const html = `<h1>2025年北京市中考数学试卷</h1><div class="paper-content"><div class="question-block"><p class="question-stem">1. 求一元一次方程的解</p></div><div class="paper-analysis"><div class="paper-analysis-content"><div class="question-block"><p class="question-stem">1. 求一元一次方程的解</p></div><p>【答案】</p><p>x=3</p><p>【分析】</p><p>移项求解</p></div></div></div>`;
        const result = parsePaperHtml(html, 'https://kaosj.com/papers/example/');
        expect(result.questions).toHaveLength(1);
        expect(result.questions[0].questionHtml).not.toContain('x=3');
        expect(result.questions[0].answerHtml).toContain('x=3');
    });
    it('keeps unsplittable full papers distinct from individual questions', () => {
        const html = `<h1>2024年高考浙江政治</h1><div class="paper-content"><p>${'原卷政治题目'.repeat(20)}</p><div class="paper-analysis"><div class="paper-analysis-content"><p>参考答案 ABCD</p></div></div></div>`;
        const result = parsePaperHtml(html, 'https://kaosj.com/papers/example/');
        expect(result.questions[0].wholePaper).toBe(true);
        expect(result.questions[0].questionHtml).not.toContain('ABCD');
        expect(result.questions[0].answerHtml).toContain('ABCD');
    });
    it('removes scripts, event handlers, embedded frames and unsafe media', () => {
        const html = sanitizeHtml('<p onclick="bad()">安全题干<script>alert(1)</script></p><iframe src="https://evil.example"></iframe><img src="javascript:bad()" onerror="bad()"><img src="/assets/figure.png" onerror="bad()">', 'https://kaosj.com/papers/');
        expect(html).toContain('安全题干');
        expect(html).not.toMatch(/onclick|onerror|script|iframe|javascript|evil\.example/);
        expect(html).toContain('https://kaosj.com/assets/figure.png');
    });
    it('identifies source title year, exam and subject independently', () => {
        expect(inferPaperMetadata('2023年广东省中考道德与法治试卷及答案')).toMatchObject({ year: 2023, examType: 'zhongkao', subject: '政治', examGrade: 9 });
    });
    it('does not treat the exam grade as a question knowledge grade', () => {
        expect(inferKnowledgeGrade('解一元一次方程', '数学', 9).grade).toBe(7);
        expect(inferKnowledgeGrade('请分析史料内容', '历史', 12).grade).toBe(null);
        expect(inferKnowledgeGrade('使用导数分析函数', '数学', 12).grade).toBe(11);
        expect(inferPaperMetadata('2023年河北省八年级中考生物试卷').examGrade).toBe(8);
    });
    it('renders source LaTeX as safe mathematical markup', () => {
        const html = sanitizeHtml('<p>$x^2+1$</p>', 'https://kaosj.com/papers/example/');
        expect(html).toContain('<math');
        expect(html).toContain('<msup>');
        expect(html).not.toContain('<script');
    });
    it('does not cross-match answers when different paper modules reuse question number 1', () => {
        const block = (text: string) => `<div class="question-block"><p class="question-stem">1. ${text}</p></div>`;
        const html = `<h1>2024年高考数学</h1><div class="paper-content">${block('甲模块题目')}${block('乙模块题目')}<div class="paper-analysis"><div class="paper-analysis-content">${block('甲模块题目')}<p>【答案】</p><p>甲答案</p>${block('乙模块题目')}<p>【答案】</p><p>乙答案</p></div></div></div>`;
        const result = parsePaperHtml(html, 'https://kaosj.com/papers/example/');
        expect(result.questions.map((question: { number: string }) => question.number)).toEqual(['1', '2']);
        expect(result.questions[0].answerHtml).toContain('甲答案');
        expect(result.questions[0].answerHtml).not.toContain('乙答案');
        expect(result.questions[1].answerHtml).toContain('乙答案');
    });
});
