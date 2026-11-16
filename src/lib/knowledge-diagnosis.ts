import { createHash } from 'crypto';
import type { StudyPreferences } from './study-preferences';

export type DiagnosisNode = { id: string; unitId: string; subject: string; grade: string; volume: string; chapter: string; term: string; meaning: string; publisher: string; textbook: string; edition: string; isbn: string; lessonPages: string[] };
export type DiagnosisEdge = { id: string; topicId: string; prerequisiteId: string; strength: 'hard' | 'soft'; reason: string };
export type DiagnosisAnswer = { topicId: string; correct: boolean; question: string; createdAt: string; source?: 'graded' | 'self' | 'legacy'; setId?: string };
export type DiagnosisStatus = 'testing' | 'mastered' | 'shaky' | 'weak';
export type DiagnosisState = { queue: string[]; currentId: string | null; attempts: Record<string, boolean[]>; status: Record<string, DiagnosisStatus>; answers: DiagnosisAnswer[]; limit: number; mode: 'target' | 'screen' };

export function diagnosisNodeId(subject: string, grade: string, term: string, unitId = '') {
  return createHash('sha256').update(JSON.stringify([subject.trim(), grade.trim(), unitId, term.trim().toLocaleLowerCase()])).digest('hex').slice(0, 20);
}

export function diagnosisNodes(preferences: StudyPreferences, subject?: string): DiagnosisNode[] {
  const nodes = new Map<string, DiagnosisNode>();
  for (const unit of preferences.studyUnits) {
    if (subject && unit.subject !== subject) continue;
    for (const entry of unit.entries) {
      const id = diagnosisNodeId(unit.subject, unit.grade, entry.term, unit.id);
      if (!nodes.has(id)) nodes.set(id, { id, unitId: unit.id, subject: unit.subject, grade: unit.grade, volume: unit.volume, chapter: unit.title, term: entry.term, meaning: entry.meaning, publisher: unit.publisher, textbook: unit.textbook, edition: unit.edition, isbn: unit.isbn, lessonPages: unit.lessons.map(lesson => lesson.page).filter(Boolean) });
    }
  }
  return [...nodes.values()];
}

export function wouldCreateCycle(edges: DiagnosisEdge[], topicId: string, prerequisiteId: string): boolean {
  if (topicId === prerequisiteId) return true;
  const parents = new Map<string, string[]>();
  for (const edge of edges) parents.set(edge.topicId, [...(parents.get(edge.topicId) || []), edge.prerequisiteId]);
  const seen = new Set<string>();
  const visit = (id: string): boolean => {
    if (id === topicId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (parents.get(id) || []).some(visit);
  };
  return visit(prerequisiteId);
}

export function startDiagnosis(targetIds: string[], mode: 'target' | 'screen' = 'target', limit = 16): DiagnosisState {
  const queue = [...new Set(targetIds)];
  return { queue: queue.slice(1), currentId: queue[0] || null, attempts: {}, status: {}, answers: [], limit, mode };
}

export function answerDiagnosis(state: DiagnosisState, topicId: string, correct: boolean, question: string, edges: DiagnosisEdge[], source: DiagnosisAnswer['source'] = 'legacy', setId?: string): DiagnosisState {
  if (state.currentId !== topicId || state.answers.length >= state.limit) throw new Error('当前诊断题目已变化，请刷新后重试');
  const attempts = { ...state.attempts, [topicId]: [...(state.attempts[topicId] || []), correct] };
  const history = attempts[topicId];
  const status = { ...state.status };
  const queue = [...state.queue];
  let resolved = false;
  if (correct && history.length >= 2 && history.at(-2) === true) { status[topicId] = 'mastered'; resolved = true; }
  else if (correct && history.includes(false)) { status[topicId] = 'shaky'; resolved = true; }
  else if (!correct && history.at(-2) === false) { status[topicId] = 'weak'; resolved = true; }
  else status[topicId] = 'testing';
  if (resolved && status[topicId] === 'weak' && state.mode === 'target') {
    const parents = edges.filter(edge => edge.topicId === topicId).sort((a, b) => a.strength === b.strength ? 0 : a.strength === 'hard' ? -1 : 1);
    const pending = parents.map(edge => edge.prerequisiteId).filter(id => !status[id] && !queue.includes(id));
    queue.unshift(...pending);
  }
  const nextId = resolved ? queue.shift() || null : topicId;
  return { ...state, attempts, status, queue, currentId: state.answers.length + 1 >= state.limit ? null : nextId, answers: [...state.answers, { topicId, correct, question: question.slice(0, 500), createdAt: new Date().toISOString(), source, ...(setId ? {setId} : {}) }] };
}

export function correctLatestDiagnosisAnswer(state: DiagnosisState, targetIds: string[], corrected: boolean, edges: DiagnosisEdge[]): DiagnosisState {
  if (!state.answers.length) throw new Error('尚无可修正的作答');
  const history = [...state.answers];
  history[history.length - 1] = { ...history[history.length - 1], correct: corrected, source: 'self' };
  let next = startDiagnosis(targetIds, state.mode, state.limit);
  for (const answer of history) next = answerDiagnosis(next, answer.topicId, answer.correct, answer.question, edges, answer.source, answer.setId);
  return next;
}

export function diagnosisSummary(state: DiagnosisState, nodes: DiagnosisNode[], edges: DiagnosisEdge[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const weak = Object.keys(state.status).filter(id => state.status[id] === 'weak');
  const shaky = Object.keys(state.status).filter(id => state.status[id] === 'shaky');
  const roots = weak.filter(id => !edges.some(edge => edge.topicId === id && weak.includes(edge.prerequisiteId)));
  const path = [...new Set([...roots, ...weak, ...shaky])].filter(id => byId.has(id));
  path.sort((a, b) => {
    if (edges.some(edge => edge.topicId === a && edge.prerequisiteId === b)) return 1;
    if (edges.some(edge => edge.topicId === b && edge.prerequisiteId === a)) return -1;
    return 0;
  });
  return { weak, shaky, mastered: Object.keys(state.status).filter(id => state.status[id] === 'mastered'), roots, path, unfinished: !!state.currentId };
}
