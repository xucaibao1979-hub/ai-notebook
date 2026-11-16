import { describe, expect, it } from 'vitest';
import { poetryForGrade, randomPoetry } from '@/lib/poetry-learning';

describe('诗词年级分层', () => {
    it('高年级优先适配当前阶段，不只推低年级作品', () => {
        expect(poetryForGrade(5).length).toBeGreaterThan(1);
        expect(poetryForGrade(5).every(item => item.minGrade >= 3 && item.minGrade <= 5)).toBe(true);
    });
    it('随机换诗避开当前一首', () => {
        const first = poetryForGrade(4)[0];
        expect(randomPoetry(4, first.title, () => 0).title).not.toBe(first.title);
    });
});
