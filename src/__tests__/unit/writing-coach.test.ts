import { describe, expect, it } from 'vitest';
import { buildWritingPlan, writingStats } from '@/lib/writing-coach';

describe('写作构思', () => {
    it('按文体提供不同的提纲，并融入自填单元主题', () => {
        const plan = buildWritingPlan('我的学校', 'narrative', '校园生活');
        expect(plan.opening).toContain('校园生活');
        expect(plan.opening).toContain('我的学校');
        expect(plan.body).toHaveLength(3);
        expect(buildWritingPlan('我的学校', 'expository').body).not.toEqual(plan.body);
        expect(buildWritingPlan('我的学校', 'argument').checklist).toContain('论据是否真实');
    });

    it('统计去空白字数与段落，拒绝空题目', () => {
        expect(writingStats('你好。\n\n 世界！')).toEqual({ length: 6, paragraphs: 2 });
        expect(() => buildWritingPlan(' ', 'narrative')).toThrow();
    });
});
