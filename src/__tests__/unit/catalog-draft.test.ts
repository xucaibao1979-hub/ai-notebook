import { describe, expect, it } from 'vitest';
import { mergeCatalogDraft, parseCatalogDraft } from '@/lib/catalog-draft';
import { StudyCourse, StudyUnit } from '@/lib/study-preferences';
import { curriculumBrief } from '@/lib/study-preferences';

const course: StudyCourse = { id: 'course-1', region: '北京', publisher: '人民教育出版社', subject: '语文', grade: '小学五年级', volume: '上册', textbook: '统编版', schoolSystem: '', edition: '', isbn: '' };

describe('AI catalog draft', () => {
    it('parses a fenced JSON draft and removes duplicate lessons', () => {
        const draft = parseCatalogDraft('```json\n{"units":[{"title":"第一单元","lessons":[{"title":"桂花雨","page":""},{"title":"桂花雨","page":""}]}]}\n```');
        expect(draft.units[0].lessons).toEqual([{ title: '桂花雨', page: '' }]);
    });
    it('adds missing lessons while preserving manual lessons and mastered knowledge points', () => {
        const existing: StudyUnit[] = [{ ...course, id: 'unit-1', title: '第一单元', lessons: [{ title: '桂花雨', page: '1' }], entries: [{ kind: '知识点', term: '借物抒情', meaning: '借物表达感情', mastered: true }] }];
        const result = mergeCatalogDraft(course, existing, { units: [{ title: '第一单元', lessons: [{ title: '桂花雨', page: '' }, { title: '落花生', page: '' }], entries: [{ kind: '知识点', term: '修辞方法', meaning: '识别比喻', }] }, { title: '第二单元', lessons: [{ title: '新课目', page: '' }], entries: [] }] });
        expect(result[0].lessons).toEqual([{ title: '桂花雨', page: '1' }, { title: '落花生', page: '' }]);
        expect(result[0].entries[0].mastered).toBe(true);
        expect(result[0].entries[1]).toMatchObject({ term: '修辞方法', mastered: false });
        expect(result[1]).toMatchObject({ publisher: course.publisher, subject: course.subject, grade: course.grade, volume: course.volume, title: '第二单元', entries: [] });
    });
    it('includes saved lesson titles in the AI curriculum context', () => {
        const raw = JSON.stringify({ activeGrade: course.grade, activePublisher: course.publisher, studyUnits: [{ ...course, id: 'unit-1', title: '第一单元', lessons: [{ title: '桂花雨', page: '' }], entries: [] }] });
        const brief = curriculumBrief(raw, course.subject, course.grade);
        expect(brief).toContain('桂花雨');
        expect(brief).toContain('未提供课文原文');
    });
    it('keeps five-four and six-three textbook units separate', () => {
        const fiveFour: StudyCourse = { ...course, schoolSystem: '五四学制', textbook: '义务教育教科书（五·四学制）·数学' };
        const sixThree: StudyUnit = { ...course, id: 'other-unit', schoolSystem: '六三学制', textbook: '义务教育教科书·数学', title: '第一单元', lessons: [{ title: '旧目录', page: '' }], entries: [] };
        const merged = mergeCatalogDraft(fiveFour, [sixThree], { units: [{ title: '第一单元', lessons: [{ title: '新目录', page: '' }], entries: [] }] });
        expect(merged).toHaveLength(2);
        expect(merged[0].lessons[0].title).toBe('旧目录');
        expect(merged[1]).toMatchObject({ schoolSystem: '五四学制', textbook: fiveFour.textbook, title: '第一单元' });
    });
});
