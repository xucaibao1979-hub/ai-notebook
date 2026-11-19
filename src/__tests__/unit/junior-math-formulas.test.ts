import { describe, expect, it } from 'vitest';
import { formulaById, formulaQuestionKey, JUNIOR_MATH_FORMULAS } from '@/lib/junior-math-formulas';

describe('junior formula catalog', () => {
  it('has stable unique IDs, two-level topics and stated conditions', () => {
    expect(JUNIOR_MATH_FORMULAS.length).toBeGreaterThanOrEqual(70);
    expect(new Set(JUNIOR_MATH_FORMULAS.map(item => item.id)).size).toBe(JUNIOR_MATH_FORMULAS.length);
    expect(new Set(JUNIOR_MATH_FORMULAS.map(item => item.latex)).size).toBe(JUNIOR_MATH_FORMULAS.length);
    expect(new Set(JUNIOR_MATH_FORMULAS.map(item => item.level1))).toEqual(new Set(['数与代数', '图形与几何', '统计与概率']));
    expect(JUNIOR_MATH_FORMULAS.every(item => item.level1 && item.level2 && item.latex && item.condition)).toBe(true);
    expect(formulaById('求根公式')?.condition).toContain('Δ≥0');
  });
  it('detects a reused question shape despite different numbers and formatting', () => {
    expect(formulaQuestionKey('计算：$2x+3=7$？')).toBe(formulaQuestionKey('计算: 5x + 8 = 13!'));
    expect(formulaQuestionKey('求解 2x+3=7')).toBe(formulaQuestionKey('计算 5x+8=13'));
    expect(formulaQuestionKey('已知半径，求圆面积')).not.toBe(formulaQuestionKey('已知直径，求圆周长'));
  });
});
