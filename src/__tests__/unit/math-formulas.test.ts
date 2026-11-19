import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { formulaById, MATH_FORMULAS, MATH_STAGES, PRIMARY_STANDARD_URL, SENIOR_STANDARD_URL } from '@/lib/math-formulas';
import { formulaLearningNotes } from '@/lib/math-formula-learning';

describe('math formula catalog', () => {
  it('covers primary, junior and senior stages with unique IDs and source links', () => {
    expect(MATH_STAGES).toEqual(['小学', '初中', '高中']);
    expect(new Set(MATH_FORMULAS.map(item => item.id)).size).toBe(MATH_FORMULAS.length);
    for (const stage of MATH_STAGES) expect(MATH_FORMULAS.filter(item => item.stage === stage).length).toBeGreaterThan(30);
    expect(formulaById('平方差公式')?.stage).toBe('初中');
    expect(formulaById('小学:圆面积')?.sourceUrl).toBe(PRIMARY_STANDARD_URL);
    expect(formulaById('高中:正弦定理')?.sourceUrl).toBe(SENIOR_STANDARD_URL);
    expect(MATH_FORMULAS.every(item => item.level1 && item.level2 && item.condition && item.grade)).toBe(true);
  });
  it('renders every expression as math', () => {
    for (const item of MATH_FORMULAS) expect(() => katex.renderToString(item.latex, { throwOnError: true })).not.toThrow();
  });
  it('provides detail and quick steps for every formula', () => {
    for (const item of MATH_FORMULAS) {
      const notes = formulaLearningNotes(item);
      expect(notes.idea.trim()).not.toBe('');
      expect(notes.steps.length).toBeGreaterThanOrEqual(3);
      expect(notes.steps.every(step => step.trim())).toBe(true);
      expect(notes.variations).toHaveLength(2);
      expect(notes.variations.every(variant => variant.expression.trim() && variant.use.trim())).toBe(true);
    }
    expect(formulaLearningNotes(formulaById('和的完全平方公式')!).example?.answer).toBe('x²+6x+9');
    expect(formulaLearningNotes(formulaById('三角形中位线')!).example?.answer).toBe('7 cm');
    expect(formulaLearningNotes(formulaById('线段双中点距离')!).example?.answer).toBe('9 cm');
    expect(formulaLearningNotes(formulaById('裂项差公式')!).example?.answer).toBe('3/4');
    expect(formulaLearningNotes(formulaById('和的完全平方公式')!).variations[0].example?.answer).toBe('ab=6');
  });
});
