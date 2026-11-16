import { describe, expect, it } from 'vitest';
import { availableSpeakingPrompts, randomSpeakingPrompt } from '@/lib/speaking-prompts';

describe('年级分层口语素材', () => {
    it('日常和学习两类有充分素材，高年级过滤过低年级句子', () => {
        expect(availableSpeakingPrompts('daily', 6).length).toBeGreaterThanOrEqual(4);
        expect(availableSpeakingPrompts('study', 6).length).toBeGreaterThanOrEqual(4);
        expect(availableSpeakingPrompts('daily', 6).every(item => item.minGrade >= 3)).toBe(true);
    });
    it('随机换句避开上一句且保持类别', () => {
        const first = availableSpeakingPrompts('daily', 5)[0];
        const next = randomSpeakingPrompt('daily', 5, first.title, () => 0);
        expect(next.title).not.toBe(first.title);
        expect(availableSpeakingPrompts('daily', 5)).toContainEqual(next);
    });
});
