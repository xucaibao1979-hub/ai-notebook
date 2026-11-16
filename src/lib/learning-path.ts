export type PathStepKind = 'foundation' | 'example' | 'practice' | 'retest';
export type PathStep = { nodeId: string; kind: PathStepKind; completedAt?: string; setId?: string; retestSessionId?: string };
export type PathState = { steps: PathStep[]; current: number };

export function createLearningPath(nodeIds: string[]): PathState {
  return { steps: [...new Set(nodeIds)].flatMap(nodeId => (['foundation', 'example', 'practice', 'retest'] as const).map(kind => ({ nodeId, kind }))), current: 0 };
}

export function completePathStep(state: PathState, index: number, details: Pick<PathStep, 'setId' | 'retestSessionId'> = {}): PathState {
  if (index !== state.current || !state.steps[index]) throw new Error('请先完成当前学习步骤');
  const steps = state.steps.map((step, position) => position === index ? { ...step, ...details, completedAt: new Date().toISOString() } : step);
  return { steps, current: Math.min(steps.length, index + 1) };
}
