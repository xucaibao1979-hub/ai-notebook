import { randomUUID } from 'crypto';
import { z } from 'zod';
import { StudyCourse, StudyUnit } from './study-preferences';
import { courseIdentity } from './study-catalog';

const lessonSchema = z.object({ title: z.string().trim().min(1).max(160), page: z.string().trim().max(20).default('') });
const entrySchema = z.object({ kind: z.enum(['单词', '短语', '句子', '知识点']).default('知识点'), term: z.string().trim().min(1).max(240), meaning: z.string().trim().min(1).max(500) });
export const catalogDraftSchema = z.object({ units: z.array(z.object({ title: z.string().trim().min(1).max(100), lessons: z.array(lessonSchema).min(1).max(40), entries: z.array(entrySchema).max(40).default([]) })).min(1).max(20) });
export type CatalogDraft = z.infer<typeof catalogDraftSchema>;

export function parseCatalogDraft(answer: string): CatalogDraft {
    const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型未返回可用的目录 JSON');
    const parsed = catalogDraftSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    return { units: parsed.units.map(unit => ({ ...unit, lessons: [...new Map(unit.lessons.map(lesson => [lesson.title, lesson])).values()], entries: [...new Map(unit.entries.map(entry => [entry.term, entry])).values()] })) };
}

export function mergeCatalogDraft(course: StudyCourse, existing: StudyUnit[], draft: CatalogDraft): StudyUnit[] {
    const result = [...existing];
    const key = courseIdentity(course);
    for (const suggestion of draft.units) {
        const index = result.findIndex(unit => courseIdentity(unit) === key && unit.title === suggestion.title);
        if (index >= 0) {
            const unit = result[index];
            const names = new Set(unit.lessons.map(lesson => lesson.title));
            const terms = new Set(unit.entries.map(entry => entry.term));
            result[index] = { ...unit, lessons: [...unit.lessons, ...suggestion.lessons.filter(lesson => !names.has(lesson.title))], entries: [...unit.entries, ...suggestion.entries.filter(entry => !terms.has(entry.term)).map(entry => ({ ...entry, mastered: false }))] };
        } else {
            result.push({ id: randomUUID(), region: course.region, publisher: course.publisher, subject: course.subject, grade: course.grade, volume: course.volume, textbook: course.textbook, schoolSystem: course.schoolSystem, edition: course.edition, isbn: course.isbn, title: suggestion.title, lessons: suggestion.lessons, entries: suggestion.entries.map(entry => ({ ...entry, mastered: false })) });
        }
    }
    return result;
}
