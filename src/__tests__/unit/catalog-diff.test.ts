import { expect, it } from 'vitest';
import { catalogDraftDiff } from '@/lib/catalog-diff';
import type { StudyCourse, StudyUnit } from '@/lib/study-preferences';

const course: StudyCourse = { id: 'book', region: '上海', publisher: '上海教育出版社', subject: '数学', grade: '小学五年级', volume: '上册', textbook: '数学', schoolSystem: '五四学制', edition: '', isbn: '' };
const unit: StudyUnit = { ...course, id: 'one', title: '小数的乘法与除法', lessons: [{ title: '小数乘法', page: '1' }], entries: [{ kind: '知识点', term: '小数乘法', meaning: '计算方法', mastered: true }] };

it('shows additions and conflicts without treating saved content as replaced', () => {
    const result = catalogDraftDiff(course, [unit], [
        { title: unit.title, lessons: [{ title: '小数乘法', page: '2' }, { title: '小数除法', page: '10' }], entries: [{ kind: '知识点', term: '小数乘法', meaning: '估算方法' }] },
        { title: '平均数', lessons: [{ title: '认识平均数', page: '29' }], entries: [] },
    ]);
    expect(result.additions).toEqual([{ title: unit.title, kind: 'content', lessons: 1, entries: 0 }, { title: '平均数', kind: 'unit', lessons: 1, entries: 0 }]);
    expect(result.conflicts).toHaveLength(2);
    expect(result.preserved).toBe(0);
});
