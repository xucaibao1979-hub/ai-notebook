import { describe, expect, it } from 'vitest';
import { generateMathQuestions, gradeMathQuestions } from '@/lib/mental-math';

describe('口算练习', () => {
    it('按题数和题型生成基础整数题', () => {
        for (const mode of ['add-sub', 'multiply', 'divide', 'mixed'] as const) {
            const questions = generateMathQuestions(mode, 20);
            expect(questions).toHaveLength(20);
            expect(questions.map(row => row.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
            expect(questions.every(row => Number.isInteger(row.answer) && row.answer >= 0)).toBe(true);
        }
    });

    it('进阶与挑战含小数和填空变式，结果最多两位小数', () => {
        for (const difficulty of ['standard', 'challenge'] as const) {
            for (const mode of ['add-sub', 'multiply', 'divide', 'mixed'] as const) {
                const questions = generateMathQuestions(mode, 50, Math.random, difficulty);
                for (const item of questions) {
                    expect(Number.isInteger(item.answer * 100) || Math.abs(item.answer * 100 - Math.round(item.answer * 100)) < 1e-8).toBe(true);
                    expect(item.answer).toBeGreaterThanOrEqual(0);
                    for (const number of item.prompt.match(/\d+(?:\.\d+)?/g) ?? []) expect(number.split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
                }
            }
        }
        const variant = generateMathQuestions('add-sub', 1, () => 0, 'challenge')[0];
        expect(variant.prompt).toContain('□');
        expect(variant.answer).toBeGreaterThanOrEqual(0);
    });

    it('支持小数判分，空白、无效格式与超两位小数不误判', () => {
        const rows = [{ id: 1, prompt: '0.1 + 0.2', answer: 0.3 }, { id: 2, prompt: '1 − 1', answer: 0 }];
        expect(gradeMathQuestions(rows, { 1: '0.30', 2: '0' }).every(row => row.correct)).toBe(true);
        expect(gradeMathQuestions(rows, { 1: '0.300', 2: '' }).every(row => !row.correct)).toBe(true);
    });

    it('限制题数 1 到 50', () => {
        expect(() => generateMathQuestions('mixed', 0)).toThrow();
        expect(() => generateMathQuestions('mixed', 51)).toThrow();
    });
});
