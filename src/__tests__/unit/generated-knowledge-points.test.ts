import { expect, it } from 'vitest';
import { generatedKnowledgePoints } from '@/lib/generated-knowledge-points';

it('deduplicates random exercise points by subject and normalized title', () => {
    const sets = [{ id: 'set-1', createdAt: new Date('2026-10-26T00:00:00Z'), parameters: JSON.stringify({ grade: '小学五年级' }), deletedIndices: '[2]', questions: JSON.stringify([
        { subject: '数学', knowledgePoints: ['小数乘法', '平均数'] },
        { subject: '数学', knowledgePoints: [' 小数乘法 ', '平均数'] },
        { subject: '数学', knowledgePoints: ['不应出现'] },
        { subject: '英语', knowledgePoints: ['小数乘法'] },
    ]) }];
    const points = generatedKnowledgePoints(sets, [{ subject: '数学', title: '平均数' }]);
    expect(points.map(point => [point.subject, point.title, point.count])).toEqual([['数学', '小数乘法', 2], ['英语', '小数乘法', 1]]);
    expect(points[0].setId).toBe('set-1');
});

it('ignores malformed saved exercise rows without hiding valid knowledge points', () => {
    const now = new Date('2026-10-26T00:00:00Z');
    expect(generatedKnowledgePoints([
        { id: 'bad', createdAt: now, questions: '{broken', parameters: '{}', deletedIndices: '[]' },
        { id: 'good', createdAt: now, questions: JSON.stringify([{ subject: '英语', knowledgePoints: ['Unit 1'] }]), parameters: '{}', deletedIndices: '[]' },
    ])).toMatchObject([{ title: 'Unit 1' }]);
});
