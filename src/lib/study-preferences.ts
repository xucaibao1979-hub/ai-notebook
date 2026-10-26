import { z } from 'zod';
const subjectTextbookSchema = z.object({
    subject: z.string().trim().min(1, '请填写科目名称').max(50),
    publisher: z.string().trim().max(100).default(''),
    textbook: z.string().trim().max(100).default(''),
    semester: z.enum(['', '上学期', '下学期', '全年']).default(''),
    chapter: z.string().trim().max(200).default(''),
});
const studyUnitEntrySchema = z.object({ kind: z.enum(['单词', '短语', '句子', '知识点']).default('知识点'), term: z.string().trim().min(1).max(240), meaning: z.string().trim().min(1).max(500), mastered: z.boolean().default(false) });
const studyLessonSchema = z.object({ title: z.string().trim().min(1).max(160), page: z.string().trim().max(20).default('') });
export const studyUnitSchema = z.object({
    id: z.string().min(1).max(100), subject: z.string().trim().min(1).max(50), grade: z.string().trim().min(1).max(80),
    region: z.string().trim().max(80).default(''),
    publisher: z.string().trim().max(100).default(''), textbook: z.string().trim().max(100), schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''), edition: z.string().trim().max(80).default(''), isbn: z.string().trim().max(32).default(''), volume: z.enum(['', '上册', '下册', '全册']).default(''), title: z.string().trim().min(1).max(100),
    lessons: z.array(studyLessonSchema).max(80).default([]),
    entries: z.array(studyUnitEntrySchema).max(120),
});
export type StudyUnit = z.infer<typeof studyUnitSchema>;
export const studyCourseSchema = z.object({
    id: z.string().min(1).max(100), publisher: z.string().trim().max(100),
    region: z.string().trim().max(80).default(''),
    subject: z.string().trim().min(1).max(50), grade: z.string().trim().min(1).max(80),
    volume: z.enum(['', '上册', '下册', '全册']).default(''), textbook: z.string().trim().max(100).default(''), schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''), edition: z.string().trim().max(80).default(''), isbn: z.string().trim().max(32).default(''),
    verification: z.enum(['manual', 'photo-ocr', 'user-photo']).optional(), savedAt: z.string().max(40).optional(),
});
export type StudyCourse = z.infer<typeof studyCourseSchema>;
export function curriculumSubject(subject: string) {
    const value = subject.trim();
    const aliases: Record<string, string> = {math:'数学',mathematics:'数学',chinese:'语文',english:'英语',外语:'英语',外:'英语',语:'语文',数:'数学',physics:'物理',chemistry:'化学',biology:'生物',history:'历史',geography:'地理',politics:'政治'};
    return aliases[value.toLowerCase()] || value;
}
export const studyPreferencesSchema = z.object({
    activeGrade: z.string().trim().max(80).default(''),
    activeRegion: z.string().trim().max(80).default(''),
    studyRegions: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    studyPublisherNodes: z.array(z.object({ region: z.string().trim().max(80), name: z.string().trim().min(1).max(100) })).max(100).default([]),
    studySubjectNodes: z.array(z.object({ region: z.string().trim().max(80), publisher: z.string().trim().min(1).max(100), name: z.string().trim().min(1).max(50) })).max(200).default([]),
    activePublisher: z.string().trim().max(100).default(''),
    studyPublishers: z.array(z.string().trim().min(1).max(100)).max(40).default([]),
    studyCourses: z.array(studyCourseSchema).max(120).default([]),
    textbook: z.string().trim().max(100).default(''),
    semester: z.enum(['上学期', '下学期', '全年']).default('全年'),
    chapter: z.string().trim().max(200).default(''),
    dailyMinutes: z.number().int().min(5).max(180).default(20),
    subjectTextbooks: z.array(subjectTextbookSchema).max(30).default([
        {subject:'语文',publisher:'',textbook:'',semester:'',chapter:''},
        {subject:'数学',publisher:'',textbook:'',semester:'',chapter:''},
        {subject:'英语',publisher:'',textbook:'',semester:'',chapter:''},
    ]).refine(rows=>new Set(rows.map(row=>curriculumSubject(row.subject))).size===rows.length,'科目名称不能重复'),
    studyUnits: z.array(studyUnitSchema).max(80).default([]),
});
export type StudyPreferences = z.infer<typeof studyPreferencesSchema>;
export function studyPreferences(raw?: string | null): StudyPreferences {
    try { return studyPreferencesSchema.parse(JSON.parse(raw || '{}')); }
    catch { return studyPreferencesSchema.parse({}); }
}
// Mutations must never turn a malformed saved value into an empty catalog.
export function storedStudyPreferences(raw?: string | null): StudyPreferences {
    return studyPreferencesSchema.parse(JSON.parse(raw || '{}'));
}

// Profile settings are edited on a separate screen and may be stale when catalog changes.
export function mergeProfileStudyPreferences(saved: StudyPreferences, submitted?: StudyPreferences, activeGrade?: string): StudyPreferences {
    return studyPreferencesSchema.parse({
        ...saved,
        ...(submitted ? {
            subjectTextbooks: submitted.subjectTextbooks,
            textbook: submitted.textbook,
            semester: submitted.semester,
            chapter: submitted.chapter,
            dailyMinutes: submitted.dailyMinutes,
        } : {}),
        ...(activeGrade !== undefined ? { activeGrade } : {}),
    });
}
export function curriculumBrief(raw?: string | null, subject?: string | null, grade?: string | null, publisher?: string | null) {
    const p = studyPreferences(raw);
    const selectedPublisher = publisher === undefined ? p.activePublisher : publisher || '';
    const name = curriculumSubject(subject || '');
    const row = p.subjectTextbooks.find(row=>curriculumSubject(row.subject)===name)
        || p.subjectTextbooks.find(row=>name.includes(curriculumSubject(row.subject)));
    const targetGrade = grade || p.activeGrade;
    const course = p.studyCourses.filter(course => curriculumSubject(course.subject) === name && course.grade === targetGrade && (!p.activeRegion || course.region === p.activeRegion) && (!selectedPublisher || course.publisher === selectedPublisher)).at(-1);
    const matchingRow = row && (!selectedPublisher || row.publisher === selectedPublisher) ? row : undefined;
    const version = course?.textbook || matchingRow?.textbook || (publisher === undefined ? p.textbook : '');
    const units = p.studyUnits.filter(unit => curriculumSubject(unit.subject) === name && !!targetGrade && unit.grade === targetGrade && (!p.activeRegion || unit.region === p.activeRegion) && (!selectedPublisher || unit.publisher === selectedPublisher) && (!course || (unit.schoolSystem === course.schoolSystem && unit.textbook === course.textbook && unit.edition === course.edition)));
    const unitContext = units.length ? `当前年级已录入的单元目录：${units.map(unit => `${unit.publisher ? unit.publisher + ' · ' : ''}${unit.volume ? unit.volume + ' · ' : ''}${unit.title}（${unit.lessons.slice(0, 8).map(lesson => `${lesson.title}${lesson.page ? ` 第${lesson.page}页` : ''}`).join('、')}；知识点：${unit.entries.slice(0, 8).map(entry => `${entry.term}：${entry.meaning}`).join('、')}）`).join('；').slice(0, 1800)}。目录课目仅提供标题和页码，未提供课文原文；无指定单元时，从已录入单元中随机选一个合适主题出题或安排复习。` : '当前年级尚未录入单元内容，不要编造某教材的具体目录或页码。';
    return `${subject ? `学科：${row?.subject || subject}；` : ''}地区：${p.activeRegion || course?.region || '未指定'}；年级：${targetGrade || '未指定'}；出版社：${selectedPublisher || course?.publisher || matchingRow?.publisher || '未指定'}；学制：${course?.schoolSystem || '未指定'}；教材版本：${version || '未指定，不假定教材版本'}；版次：${course?.edition || '未指定'}；学期：${matchingRow?.semester || p.semester}；当前章节：${matchingRow?.chapter || p.chapter || '当前年级已学基础知识'}。${unitContext}按此科目教材版本组织知识点、术语、方法和练习，不要混用其他科目教材，不要超出当前章节和年级范围。未提供教材原文时不要编造教材页码或声称已逐页核对；原题超出范围时说明并优先提供范围内的复习变式。`;
}
export function curriculumSummary(raw?:string|null,subject?:string|null,publisherOverride?:string|null){
    const p=studyPreferences(raw),name=curriculumSubject(subject||'');
    const selectedPublisher=publisherOverride===undefined?p.activePublisher:publisherOverride||'';
    const row=p.subjectTextbooks.find(r=>curriculumSubject(r.subject)===name)||p.subjectTextbooks.find(r=>name.includes(curriculumSubject(r.subject)));
    const course=p.studyCourses.filter(c=>curriculumSubject(c.subject)===name&&c.grade===p.activeGrade&&(!p.activeRegion||c.region===p.activeRegion)&&(!selectedPublisher||c.publisher===selectedPublisher)).at(-1);
    const matchingRow=row&&(!selectedPublisher||row.publisher===selectedPublisher)?row:undefined;
    const publisher=selectedPublisher||course?.publisher||matchingRow?.publisher;
    return `${publisher?publisher+' · ':''}${course?.textbook||matchingRow?.textbook||(publisherOverride===undefined?p.textbook:'')||'未设置教材版本'}${course?.edition?` · ${course.edition}`:''} · ${matchingRow?.semester||p.semester} · ${matchingRow?.chapter||p.chapter||'当前年级基础知识'}`;
}
