import { createHash } from 'crypto';
import { StudyCourse, StudyPreferences } from './study-preferences';

export function courseIdentity(course: Pick<StudyCourse, 'publisher' | 'subject' | 'grade' | 'volume'> & { region?: string; schoolSystem?: string; textbook?: string; edition?: string; isbn?: string }) {
    return [course.region?.trim() || '', course.publisher.trim(), course.subject.trim(), course.grade.trim(), course.volume, course.schoolSystem?.trim() || '', course.textbook?.trim() || '', course.edition?.trim() || '', course.isbn?.replace(/[^0-9X]/gi, '') || ''].join('\u0000');
}

export function catalogCourses(preferences: StudyPreferences): StudyCourse[] {
    const result = [...preferences.studyCourses];
    const keys = new Set(result.map(courseIdentity));
    for (const row of preferences.subjectTextbooks) {
        if (!row.publisher || !preferences.activeGrade) continue;
        const legacy = { region: '', publisher: row.publisher, subject: row.subject, grade: preferences.activeGrade, volume: '' as const, textbook: row.textbook, schoolSystem: '' as const, edition: '', isbn: '' };
        const key = courseIdentity(legacy);
        if (keys.has(key)) continue;
        result.push({ id: `legacy-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`, ...legacy });
        keys.add(key);
    }
    for (const unit of preferences.studyUnits) {
        const key = courseIdentity(unit);
        if (keys.has(key)) continue;
        result.push({ id: `legacy-${createHash('sha256').update(key).digest('hex').slice(0, 20)}`, region: unit.region, publisher: unit.publisher, subject: unit.subject, grade: unit.grade, volume: unit.volume, textbook: unit.textbook, schoolSystem: unit.schoolSystem, edition: unit.edition, isbn: unit.isbn });
        keys.add(key);
    }
    return result;
}

export function catalogRegions(preferences: StudyPreferences) {
    return [...new Set([...preferences.studyRegions, ...preferences.studyCourses.map(course => course.region), ...preferences.studyUnits.map(unit => unit.region)].filter(Boolean))];
}

export function catalogPublisherNodes(preferences: StudyPreferences) {
    const nodes = [...preferences.studyPublisherNodes];
    for (const course of catalogCourses(preferences)) if (!nodes.some(node => node.region === course.region && node.name === course.publisher) && course.publisher) nodes.push({ region: course.region, name: course.publisher });
    for (const name of preferences.studyPublishers) if (!nodes.some(node => !node.region && node.name === name)) nodes.push({ region: '', name });
    return nodes;
}

export function catalogSubjectNodes(preferences: StudyPreferences) {
    const nodes = [...preferences.studySubjectNodes];
    for (const course of catalogCourses(preferences)) if (!nodes.some(node => node.region === course.region && node.publisher === course.publisher && node.name === course.subject)) nodes.push({ region: course.region, publisher: course.publisher, name: course.subject });
    return nodes;
}

export function catalogPublishers(preferences: StudyPreferences): string[] {
    return [...new Set([
        ...preferences.studyPublishers,
        ...preferences.studyCourses.map(course => course.publisher),
        ...preferences.studyUnits.map(unit => unit.publisher),
        ...preferences.subjectTextbooks.map(row => row.publisher),
    ].filter(Boolean))];
}
