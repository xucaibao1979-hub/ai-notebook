import type { StudyCourse, StudyUnit } from './study-preferences';
import { courseIdentity } from './study-catalog';

type DraftUnit = { title: string; lessons: StudyUnit['lessons']; entries: Pick<StudyUnit['entries'][number], 'kind' | 'term' | 'meaning'>[] };

export function catalogDraftDiff(course: StudyCourse, existing: StudyUnit[], draft: DraftUnit[]) {
    const saved = existing.filter(unit => courseIdentity(unit) === courseIdentity(course));
    const additions: { title: string; kind: 'unit' | 'content'; lessons: number; entries: number }[] = [];
    const conflicts: string[] = [];
    let unchanged = 0;
    for (const suggestion of draft) {
        const unit = saved.find(item => item.title === suggestion.title);
        if (!unit) {
            additions.push({ title: suggestion.title, kind: 'unit', lessons: suggestion.lessons.length, entries: suggestion.entries.length });
            continue;
        }
        const lessons = suggestion.lessons.filter(item => !unit.lessons.some(saved => saved.title === item.title));
        const entries = suggestion.entries.filter(item => !unit.entries.some(saved => saved.term === item.term));
        if (lessons.length || entries.length) additions.push({ title: suggestion.title, kind: 'content', lessons: lessons.length, entries: entries.length });
        else unchanged++;
        for (const item of suggestion.lessons) {
            const old = unit.lessons.find(saved => saved.title === item.title);
            if (old && old.page !== item.page) conflicts.push(`${suggestion.title} · ${item.title}：页码 ${old.page || '空'} / ${item.page || '空'}`);
        }
        for (const item of suggestion.entries) {
            const old = unit.entries.find(saved => saved.term === item.term);
            if (old && (old.kind !== item.kind || old.meaning !== item.meaning)) conflicts.push(`${suggestion.title} · ${item.term}：释义或类型不同`);
        }
    }
    return { additions, conflicts, unchanged, preserved: saved.filter(unit => !draft.some(item => item.title === unit.title)).length };
}
