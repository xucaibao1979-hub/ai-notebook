import { describe, expect, it } from 'vitest';
import { answerDiagnosis, correctLatestDiagnosisAnswer, startDiagnosis, wouldCreateCycle, type DiagnosisEdge } from '@/lib/knowledge-diagnosis';
import { completePathStep, createLearningPath } from '@/lib/learning-path';

const edges: DiagnosisEdge[] = [{ id: 'e1', topicId: 'fraction', prerequisiteId: 'division', strength: 'hard', reason: '理解除法后学习分数' }];

describe('knowledge diagnosis', () => {
  it('traces a confirmed weakness to its prerequisite', () => {
    const first = answerDiagnosis(startDiagnosis(['fraction']), 'fraction', false, 'q1', edges);
    expect(first.currentId).toBe('fraction');
    const second = answerDiagnosis(first, 'fraction', false, 'q2', edges);
    expect(second.status.fraction).toBe('weak');
    expect(second.currentId).toBe('division');
  });
  it('marks one mistake followed by a correct answer as shaky', () => {
    const first = answerDiagnosis(startDiagnosis(['fraction']), 'fraction', false, 'q1', edges);
    const second = answerDiagnosis(first, 'fraction', true, 'q2', edges);
    expect(second.status.fraction).toBe('shaky');
    expect(second.currentId).toBeNull();
  });
  it('rejects a prerequisite cycle', () => {
    expect(wouldCreateCycle(edges, 'division', 'fraction')).toBe(true);
    expect(wouldCreateCycle(edges, 'addition', 'fraction')).toBe(false);
  });
  it('recomputes a mistaken assessment from its answers', () => {
    const first = answerDiagnosis(startDiagnosis(['fraction']), 'fraction', false, 'q1', edges, 'self');
    const second = answerDiagnosis(first, 'fraction', false, 'q2', edges, 'self');
    const corrected = correctLatestDiagnosisAnswer(second, ['fraction'], true, edges);
    expect(corrected.status.fraction).toBe('shaky');
    expect(corrected.currentId).toBeNull();
    expect(corrected.answers.at(-1)?.source).toBe('self');
  });
  it('keeps path steps in order', () => {
    const path = createLearningPath(['division']);
    expect(path.steps.map(step => step.kind)).toEqual(['foundation', 'example', 'practice', 'retest']);
    expect(() => completePathStep(path, 1)).toThrow();
    expect(completePathStep(path, 0).current).toBe(1);
  });
});
