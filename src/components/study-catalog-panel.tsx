"use client";

import { useCallback, useEffect, useState } from 'react';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { StudyCourse, StudyUnit } from '@/lib/study-preferences';
import { STUDENT_GRADES } from '@/lib/student-grade';
import { matchingVerifiedTextbook, shanghaiMathFiveFour2026 } from '@/lib/verified-textbook-catalog';
import { catalogDraftDiff } from '@/lib/catalog-diff';
import { shanghaiEnglishFiveFourReferenceUrl } from '@/lib/reference-textbook-catalog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type Catalog = { regions: string[]; publisherNodes: {region: string; name: string}[]; subjectNodes: {region: string; publisher: string; name: string}[]; publishers: string[]; courses: StudyCourse[]; units: StudyUnit[]; activeRegion: string; activePublisher: string; dailyMinutes: number; grade: string };
type SuggestedCatalog = { courseId: string; mode: 'catalog' | 'knowledge'; course: Pick<StudyCourse, 'region' | 'publisher' | 'subject' | 'grade' | 'volume' | 'textbook' | 'schoolSystem' | 'edition' | 'isbn'>; verification: 'ai-draft' | 'user-photo' | 'reference'; units: { title: string; lessons: { title: string; page: string }[]; entries: StudyUnit['entries']; lessonText: string; entryText: string; selected: boolean }[] };
type GradeDraft = { scope: { region: string; publisher: string; subject: string; grade: string; schoolSystem: StudyCourse['schoolSystem']; textbook: string; edition: string; isbn: string }; volumes: { volume: '上册' | '下册'; verification: 'ai-draft' | 'user-photo' | 'photo-ocr' | 'reference'; units: { title: string; lessonText: string; entryText: string; selected: boolean }[] }[] };
type PhotoCatalogResult = { publisher: string; subject: string; grade: string; volume: string; schoolSystem: StudyCourse['schoolSystem']; textbook: string; edition: string; isbn: string; items: { number: string; title: string; page: string }[]; recognizedPages: number; totalPages: number; failedPages: number; status: 'catalog' | 'metadata-only' };
type Volume = StudyCourse['volume'];
type CatalogRevision = { id: string; action: string; createdAt: string; courses: number; units: number; entries: number };
type CatalogTaskRef = { id: string; region: string; publisher: string; subject: string; grade: string };
type CatalogTask = { id: string; status: 'pending' | 'running' | 'succeeded' | 'failed'; result: PhotoCatalogResult | null; error: string | null; createdAt: string };
const kinds = ['单词', '短语', '句子', '知识点'] as const;
function unitKey(item: Pick<StudyUnit, 'region' | 'publisher' | 'subject' | 'grade' | 'volume' | 'schoolSystem' | 'textbook' | 'edition' | 'isbn'>) { return [item.region, item.publisher, item.subject, item.grade, item.volume, item.schoolSystem, item.textbook, item.edition, item.isbn.replace(/[^0-9X]/gi, '')].join('\u0000'); }
function parseEntries(lines: string, subject: string, previous?: StudyUnit): StudyUnit['entries'] {
    return lines.split(/\r?\n/).map(line => line.split(/[|｜\t]/).map(part => part.trim())).map(parts => {
        const explicit = kinds.find(kind => kind === parts[0]);
        const term = explicit ? parts[1] : parts[0];
        const meaning = (explicit ? parts.slice(2) : parts.slice(1)).join('；');
        const inferred = subject === '英语' ? /[.!?]$/.test(term || '') ? '句子' : /\s/.test(term || '') ? '短语' : '单词' : '知识点';
        return { kind: explicit || inferred, term, meaning, mastered: previous?.entries.find(entry => entry.term === term)?.mastered || false };
    }).filter(entry => entry.term && entry.meaning);
}
function parseLessons(lines: string): StudyUnit['lessons'] {
    return lines.split(/\r?\n/).map(line => {
        const [title, page = ''] = line.split(/[|｜\t]/).map(part => part.trim());
        return { title, page };
    }).filter(lesson => lesson.title);
}
function matchesBook(course: StudyCourse, book: { schoolSystem: string; textbook: string; edition: string; isbn: string }) {
    const normalized = (value: string) => value.replace(/[·•.．\s（）()]/g, '');
    const isbn = (value: string) => value.replace(/[^0-9X]/gi, '').toUpperCase();
    return (!book.schoolSystem || course.schoolSystem === book.schoolSystem) &&
        (!book.textbook || normalized(course.textbook) === normalized(book.textbook)) &&
        (!book.edition || course.edition.replace(/\s/g, '') === book.edition.replace(/\s/g, '')) &&
        (!book.isbn || isbn(course.isbn) === isbn(book.isbn));
}
async function prepareCatalogImage(file: File): Promise<string> {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12_000_000) throw new Error('请上传 12 MB 以内的 JPG、PNG 或 WebP 照片。');
    const bitmap = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('浏览器无法处理照片，请更换图片重试。');
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
    } finally { bitmap.close(); }
}

function NodeManageMenu({ label, canAdd, canEdit, busy, onAdd, onEdit, onDelete }: { label: string; canAdd: boolean; canEdit: boolean; busy: boolean; onAdd: () => void; onEdit: () => void; onDelete: () => void }) {
    return <div className="group relative inline-flex items-center gap-1"><button type="button" aria-label={`${label}管理操作`} aria-haspopup="menu" className="rounded px-1 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus:bg-slate-100">{label} <span aria-hidden="true" className="text-slate-400">···</span></button><div role="menu" aria-label={`${label}管理`} className="absolute left-0 top-full z-20 hidden min-w-24 rounded-md border bg-white p-1 shadow-lg group-hover:block group-focus-within:block"><button type="button" role="menuitem" disabled={!canAdd || busy} onClick={onAdd} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 disabled:opacity-40">添加</button><button type="button" role="menuitem" disabled={!canEdit || busy} onClick={onEdit} className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 disabled:opacity-40">修改</button><button type="button" role="menuitem" disabled={!canEdit || busy} onClick={onDelete} className="block w-full rounded px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">删除</button></div></div>;
}

export function StudyCatalogPanel() {
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [revisions, setRevisions] = useState<CatalogRevision[]>([]);
    const [photoTask, setPhotoTask] = useState<CatalogTaskRef | null>(null);
    const [recentTasks, setRecentTasks] = useState<CatalogTask[]>([]);
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
    const [nodeForm, setNodeForm] = useState<'region' | 'publisher' | 'subject' | ''>('');
    const [nodeName, setNodeName] = useState('');
    const [oldNodeName, setOldNodeName] = useState('');
    const [selectedPublisher, setSelectedPublisher] = useState<string | null>(null);
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedGrade, setSelectedGrade] = useState('');
    const [expandedCourse, setExpandedCourse] = useState('');
    const [expandedUnit, setExpandedUnit] = useState('');
    const [suggestedCatalog, setSuggestedCatalog] = useState<SuggestedCatalog | null>(null);
    const [gradeDraft, setGradeDraft] = useState<GradeDraft | null>(null);
    const [gradeDraftBusy, setGradeDraftBusy] = useState(false);
    const [gradeDraftProgress, setGradeDraftProgress] = useState('');
    const [failedVolumes, setFailedVolumes] = useState<('上册' | '下册')[]>([]);
    const [courseForm, setCourseForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState('');
    const [coursePublisher, setCoursePublisher] = useState('');
    const [courseRegion, setCourseRegion] = useState('');
    const [courseSubject, setCourseSubject] = useState('数学');
    const [courseGrade, setCourseGrade] = useState('');
    const [courseVolume, setCourseVolume] = useState<Volume>('上册');
    const [courseTextbook, setCourseTextbook] = useState('');
    const [courseEdition, setCourseEdition] = useState('');
    const [courseIsbn, setCourseIsbn] = useState('');
    const [courseSchoolSystem, setCourseSchoolSystem] = useState<StudyCourse['schoolSystem']>('');
    const [gradeSchoolSystem, setGradeSchoolSystem] = useState<StudyCourse['schoolSystem']>('');
    const [gradeTextbook, setGradeTextbook] = useState('');
    const [gradeEdition, setGradeEdition] = useState('');
    const [gradeIsbn, setGradeIsbn] = useState('');
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoWarning, setPhotoWarning] = useState('');
    const [photoResult, setPhotoResult] = useState<PhotoCatalogResult | null>(null);
    const [photoStatus, setPhotoStatus] = useState<{ kind: 'working' | 'success' | 'partial' | 'error'; text: string } | null>(null);
    const [unitCourse, setUnitCourse] = useState('');
    const [editingUnit, setEditingUnit] = useState('');
    const [unitTitle, setUnitTitle] = useState('');
    const [unitLessons, setUnitLessons] = useState('');
    const [unitLines, setUnitLines] = useState('');
    const [knowledgePhotoBusy, setKnowledgePhotoBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    async function scanKnowledgePhotos(files: FileList | null) {
        if (!files?.length) return;
        if (files.length > 4) { setMessage('每次最多选择 4 张本单元的词表或知识点页。'); return; }
        setKnowledgePhotoBusy(true);
        setMessage('正在识别教材原文，结果会填入下方学习内容供核对。');
        try {
            const images = await Promise.all(Array.from(files).map(prepareCatalogImage));
            const subject = catalog?.courses.find(course => course.id === unitCourse)?.subject || selectedSubject;
            const result = await apiClient.post<{ entries: StudyUnit['entries']; recognizedPages: number; totalPages: number }>('/api/study-catalog/photo-knowledge', { images, subject, unit: unitTitle }, { timeout: 240000 });
            const existing = unitLines.trim();
            const lines = result.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n');
            setUnitLines(existing ? `${existing}\n${lines}` : lines);
            setMessage(`已从 ${result.recognizedPages}/${result.totalPages} 张照片识别 ${result.entries.length} 条，请对照原页核对并保存单元。`);
        } catch (error) { setMessage(friendlyApiError(error)); }
        finally { setKnowledgePhotoBusy(false); }
    }
    const refresh = useCallback(async () => {
        const next = await apiClient.get<Catalog>('/api/study-catalog');
        setCatalog(next);
        apiClient.get<{ items: CatalogRevision[] }>('/api/study-catalog?revisions=1').then(result => setRevisions(result.items)).catch(() => {});
        setCourseGrade(current => current || next.grade);
        const region = next.regions.includes('上海') ? '上海' : next.activeRegion || next.regions[0] || '';
        const publisher = next.publisherNodes.some(node => node.region === region && node.name === '上海教育出版社')
            ? '上海教育出版社'
            : next.publisherNodes.some(node => node.region === region && node.name === next.activePublisher)
                ? next.activePublisher
                : next.publisherNodes.find(node => node.region === region)?.name || '';
        const subjects = next.subjectNodes.filter(node => node.region === region && node.publisher === publisher).map(node => node.name);
        setSelectedRegion(current => current === null ? region : current);
        setSelectedPublisher(current => current === null ? publisher : current);
        setSelectedSubject(current => current || (subjects.includes('数学') ? '数学' : subjects[0] || ''));
        setSelectedGrade(current => current || next.grade);
        return next;
    }, []);
    useEffect(() => { refresh().catch(error => setMessage(friendlyApiError(error))); }, [refresh]);
    useEffect(() => { try { const saved = localStorage.getItem('catalog-photo-task'); if (saved) setPhotoTask(JSON.parse(saved) as CatalogTaskRef); } catch { localStorage.removeItem('catalog-photo-task'); } apiClient.get<{ items: CatalogTask[] }>('/api/study-tasks?kind=catalog-photo').then(result => setRecentTasks(result.items)).catch(() => {}); }, []);
    const courses = catalog?.courses.filter(course => (selectedRegion === null || course.region === selectedRegion) && (selectedPublisher === null || course.publisher === selectedPublisher) && (!selectedSubject || course.subject === selectedSubject) && (!selectedGrade || course.grade === selectedGrade)) || [];
    const bookFilterActive = !!(gradeSchoolSystem || gradeTextbook || gradeEdition || gradeIsbn);
    const matchingCourses = bookFilterActive ? courses.filter(course => matchesBook(course, { schoolSystem: gradeSchoolSystem, textbook: gradeTextbook, edition: gradeEdition, isbn: gradeIsbn })) : courses;
    const otherEditionCourses = bookFilterActive ? courses.filter(course => !matchesBook(course, { schoolSystem: gradeSchoolSystem, textbook: gradeTextbook, edition: gradeEdition, isbn: gradeIsbn })) : [];
    const savedMathCourses = catalog?.courses.filter(course => course.region === selectedRegion && course.publisher === selectedPublisher && course.subject === '数学' && (!selectedGrade || course.grade === selectedGrade) && catalog.units.some(unit => unitKey(unit) === unitKey(course))) || [];
    const scopedPublishers = catalog?.publisherNodes.filter(node => selectedRegion === null || node.region === selectedRegion).map(node => node.name) || [];
    const scopedSubjects = catalog?.subjectNodes.filter(node => (selectedRegion === null || node.region === selectedRegion) && (selectedPublisher === null || node.publisher === selectedPublisher)).map(node => node.name) || [];
    const photoTargetGrade = photoResult?.grade ? Object.values(STUDENT_GRADES).find(grade => grade === photoResult.grade || grade.endsWith(photoResult.grade)) : selectedGrade;
    const photoSwitchAvailable = !!photoResult && !!selectedRegion && !!photoResult.publisher && !!photoResult.subject && !!photoTargetGrade && !!catalog?.subjectNodes.some(node => node.region === selectedRegion && node.publisher === photoResult.publisher && node.name === photoResult.subject);
    const photoNeedsContents = !!photoResult && !photoResult.items.length && !photoWarning && !gradeDraft;
    function clearBookContext() { setGradeSchoolSystem(''); setGradeTextbook(''); setGradeEdition(''); setGradeIsbn(''); setGradeDraft(null); setPhotoResult(null); setPhotoStatus(null); setPhotoWarning(''); }
    function addPhotoFiles(fileList: FileList | null) {
        const selected = Array.from(fileList || []);
        if (!selected.length) return;
        setPhotoFiles(current => [...current, ...selected.filter(file => !current.some(saved => saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified))].slice(0, 4));
        setPhotoWarning(''); setPhotoResult(null); setPhotoStatus(null); setGradeDraft(null);
    }
    async function mutate(action: string, payload: Record<string, unknown>, success: string) {
        setBusy(true); setMessage('');
        try { await apiClient.post('/api/study-catalog', { action, ...payload }); await refresh(); setMessage(success); }
        catch (error) { setMessage(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    function openNodeForm(type: 'region' | 'publisher' | 'subject', name = '') { setNodeForm(type); setNodeName(name); setOldNodeName(name); }
    async function saveNode() {
        const name = nodeName.trim();
        if (!name || (nodeForm !== 'region' && !selectedRegion) || (nodeForm === 'subject' && !selectedPublisher)) { setMessage('请先选择上级目录并填写名称。'); return; }
        const action = `${oldNodeName ? 'edit' : 'add'}${nodeForm[0].toUpperCase()}${nodeForm.slice(1)}${nodeForm === 'region' ? '' : 'Node'}`;
        const payload = nodeForm === 'region' ? { region: name, ...(oldNodeName ? { oldName: oldNodeName } : {}) } : nodeForm === 'publisher' ? { region: selectedRegion, name, ...(oldNodeName ? { oldName: oldNodeName } : {}) } : { region: selectedRegion, publisher: selectedPublisher, name, ...(oldNodeName ? { oldName: oldNodeName } : {}) };
        setBusy(true); setMessage('');
        try { await apiClient.post('/api/study-catalog', { action, ...payload }); await refresh(); if (nodeForm === 'region') { setSelectedRegion(name); setSelectedPublisher(''); setSelectedSubject(''); } else if (nodeForm === 'publisher') { setSelectedPublisher(name); setSelectedSubject(''); } else setSelectedSubject(name); setNodeForm(''); window.dispatchEvent(new Event('study-units-updated')); setMessage('目录节点已保存。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    async function removeNode(type: 'region' | 'publisher' | 'subject') {
        const name = type === 'region' ? selectedRegion : type === 'publisher' ? selectedPublisher : selectedSubject;
        if (!name || !window.confirm(`删除「${name}」及其下级目录、单元和知识点？已生成的练习历史保留。`)) return;
        const query = new URLSearchParams({ type: type === 'region' ? 'region' : type === 'publisher' ? 'publisherNode' : 'subjectNode', name, region: selectedRegion || '', publisher: selectedPublisher || '' });
        setBusy(true); setMessage('');
        try { await apiClient.delete(`/api/study-catalog?${query}`); const next = await refresh(); if (type === 'region') { setSelectedRegion(next.regions[0] || ''); setSelectedPublisher(''); setSelectedSubject(''); } else if (type === 'publisher') { setSelectedPublisher(''); setSelectedSubject(''); } else setSelectedSubject(''); window.dispatchEvent(new Event('study-units-updated')); setMessage('目录节点及下级内容已删除。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    async function saveCourse() {
        if (!courseRegion || !coursePublisher || !courseGrade) { setMessage('请先选择地区、出版社、科目和年级。'); return; }
        setBusy(true); setMessage('');
        try {
            const result = await apiClient.post<{ id?: string }>('/api/study-catalog', { action: editingCourse ? 'editCourse' : 'addCourse', id: editingCourse, course: { region: courseRegion, publisher: coursePublisher, subject: courseSubject, grade: courseGrade, volume: courseVolume, textbook: courseTextbook.trim(), schoolSystem: courseSchoolSystem, edition: courseEdition.trim(), isbn: courseIsbn.trim() } });
            const next = await refresh(); const created = next.courses.find(course => course.id === result.id || (course.region === courseRegion && course.publisher === coursePublisher && course.subject === courseSubject && course.grade === courseGrade && course.volume === courseVolume && course.edition === courseEdition.trim() && course.isbn === courseIsbn.trim()));
            setSelectedRegion(courseRegion); setSelectedPublisher(coursePublisher); setSelectedSubject(courseSubject); setSelectedGrade(''); setExpandedCourse(created?.id || ''); setCourseForm(false); setEditingCourse(''); setCourseTextbook(''); window.dispatchEvent(new Event('study-units-updated')); setMessage(editingCourse ? '目录及下属单元已更新。' : '年级目录已添加，可以继续录入单元。');
        } catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    function startCourse(course?: StudyCourse) { setEditingCourse(course?.id || ''); setCourseRegion(course?.region || selectedRegion || ''); setCoursePublisher(course?.publisher || selectedPublisher || ''); setCourseSubject(course?.subject || selectedSubject || ''); setCourseGrade(course?.grade || selectedGrade || catalog?.grade || ''); setCourseVolume(course?.volume || '上册'); setCourseTextbook(course?.textbook || gradeTextbook); setCourseSchoolSystem(course?.schoolSystem || gradeSchoolSystem); setCourseEdition(course?.edition || gradeEdition); setCourseIsbn(course?.isbn || gradeIsbn); setCourseForm(true); }
    async function removeCourse(course: StudyCourse) {
        const count = catalog?.units.filter(unit => unitKey(unit) === unitKey(course)).length || 0;
        if (!window.confirm(`删除「${course.subject} · ${course.grade} · ${course.volume || '未分册'}」及其下 ${count} 个单元？已生成的练习历史保留。`)) return;
        setBusy(true); setMessage('');
        try { await apiClient.delete(`/api/study-catalog?type=course&id=${encodeURIComponent(course.id)}`); await refresh(); setExpandedCourse(''); window.dispatchEvent(new Event('study-units-updated')); setMessage('科目年级目录已删除。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    function startUnit(course: StudyCourse, unit?: StudyUnit) { setExpandedCourse(course.id); setUnitCourse(course.id); setEditingUnit(unit?.id || ''); setExpandedUnit(unit?.id || ''); setUnitTitle(unit?.title || ''); setUnitLessons(unit?.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n') || ''); setUnitLines(unit?.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n') || ''); }
    async function saveUnit(course: StudyCourse) {
        const previous = catalog?.units.find(unit => unit.id === editingUnit);
        const entries = parseEntries(unitLines, course.subject, previous);
        const lessons = parseLessons(unitLessons);
        if (!unitTitle.trim() || (!entries.length && !lessons.length)) { setMessage('请填写单元名称，并至少录入一条课目或知识点。'); return; }
        setBusy(true); setMessage('');
        try { const payload = { region: course.region, publisher: course.publisher, subject: course.subject, grade: course.grade, volume: course.volume, textbook: course.textbook, schoolSystem: course.schoolSystem, edition: course.edition, isbn: course.isbn, title: unitTitle.trim(), lessons, entries }; if (editingUnit) await apiClient.put('/api/study-units', { ...payload, id: editingUnit }); else await apiClient.post('/api/study-units', payload); await refresh(); setUnitCourse(''); setEditingUnit(''); setUnitTitle(''); setUnitLessons(''); setUnitLines(''); window.dispatchEvent(new Event('study-units-updated')); setMessage('单元已保存。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    async function removeUnit(unit: StudyUnit) {
        if (!window.confirm(`删除「${unit.title}」及其学习进度？已生成的练习历史保留。`)) return;
        setBusy(true); setMessage('');
        try { await apiClient.delete(`/api/study-units?id=${encodeURIComponent(unit.id)}`); await refresh(); window.dispatchEvent(new Event('study-units-updated')); setMessage('单元已删除。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    async function moveItem(action: 'moveCourse' | 'moveUnit', id: string, direction: 'up' | 'down') {
        setBusy(true); setMessage('');
        try { await apiClient.post('/api/study-catalog', { action, id, direction }); await refresh(); window.dispatchEvent(new Event('study-units-updated')); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    async function suggestCourse(course: StudyCourse) {
        if (!course.schoolSystem || !course.textbook.trim()) { setMessage('请先点击该年级目录的“修改”，补充学制和教材全名，再生成目录。'); return; }
        setBusy(true); setMessage(''); setExpandedCourse(course.id); setSuggestedCatalog(null);
        try {
            const result = await apiClient.post<{ course: SuggestedCatalog['course']; verification: SuggestedCatalog['verification']; units: { title: string; lessons: { title: string; page: string }[]; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest', { courseId: course.id }, { timeout: 180000 });
            setSuggestedCatalog({ courseId: course.id, mode: 'catalog', course: result.course, verification: result.verification, units: result.units.map(unit => ({ ...unit, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) });
            setMessage(result.verification === 'user-photo' ? '已读取你提供的五年级上册目录照片：请核对 9 项目录后应用。知识点尚未从课文中核实。' : 'AI 目录与知识点草稿已生成。请对照实际教材核对，勾选后应用；已有内容会保留。');
        } catch (error) { setMessage(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    async function suggestRelated(course: StudyCourse, mode: 'companion' | 'knowledge') {
        setBusy(true); setMessage('');
        try {
            if (mode === 'knowledge') {
                const result = await apiClient.post<{ course: SuggestedCatalog['course']; units: { title: string; lessons: StudyUnit['lessons']; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest-related', { courseId: course.id, mode }, { timeout: 150000 });
                setExpandedCourse(course.id);
                setSuggestedCatalog({ courseId: course.id, mode: 'knowledge', course: result.course, verification: 'ai-draft', units: result.units.map(unit => ({ ...unit, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) });
                setMessage(`已生成 ${result.units.length} 个单元的知识点草稿。请在目录下逐项核对后应用；原有知识点会保留。`);
            } else {
                const result = await apiClient.post<{ scope: GradeDraft['scope']; volume: '上册' | '下册'; verification: 'ai-draft' | 'reference'; units: { title: string; lessons: StudyUnit['lessons']; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest-related', { courseId: course.id, mode }, { timeout: 150000 });
                setGradeDraft({ scope: result.scope, volumes: [{ volume: result.volume, verification: result.verification, units: result.units.map(unit => ({ title: unit.title, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) }] });
                setGradeSchoolSystem(result.scope.schoolSystem); setGradeTextbook(result.scope.textbook); setGradeEdition(''); setGradeIsbn('');
                setPhotoWarning(''); setPhotoResult(null); setPhotoStatus(null);
                setMessage(`已根据${course.volume}得到${result.volume}的${result.verification === 'reference' ? '公开参考目录' : '学习主题建议'}。请逐项核对；另一册的 ISBN 和版次需单独填写。`);
            }
        } catch (error) { setMessage(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    async function applySuggestion() {
        if (!suggestedCatalog) return;
        const units = suggestedCatalog.units.filter(unit => unit.selected).map(({ title, lessonText, entryText }) => ({ title: title.trim(), lessons: parseLessons(lessonText), entries: parseEntries(entryText, suggestedCatalog.course.subject).map(({ kind, term, meaning }) => ({ kind, term, meaning })) }));
        if (!units.length) { setMessage('请至少选择一个单元。'); return; }
        setBusy(true); setMessage('');
        try {
            const result = await apiClient.post<{ added: number }>('/api/study-catalog', { action: suggestedCatalog.mode === 'knowledge' ? 'applyKnowledgeDraft' : 'applyCatalogDraft', courseId: suggestedCatalog.courseId, course: suggestedCatalog.course, units });
            await refresh(); setSuggestedCatalog(null); window.dispatchEvent(new Event('study-units-updated'));
            setMessage(suggestedCatalog.mode === 'knowledge' ? '知识点已更新，同名知识点的内容已替换，学习进度已保留。' : `目录与知识点已更新：新增 ${result.added} 个单元；同名单元补充缺少的课目和知识点，原有内容均保留。`);
        } catch (error) { setMessage(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    function updateSuggestedUnit(index: number, changes: Partial<SuggestedCatalog['units'][number]>) {
        setSuggestedCatalog(current => current ? { ...current, units: current.units.map((unit, position) => position === index ? { ...unit, ...changes } : unit) } : null);
    }
    async function suggestGrade() {
        if (!selectedRegion || !selectedPublisher || !selectedSubject || !selectedGrade) return;
        const enteredScope = { region: selectedRegion, publisher: selectedPublisher, subject: selectedSubject, grade: selectedGrade, schoolSystem: gradeSchoolSystem, textbook: gradeTextbook.trim(), edition: gradeEdition.trim(), isbn: gradeIsbn.trim() } as GradeDraft['scope'];
        const matchedBook = matchingVerifiedTextbook(enteredScope);
        const scope = matchedBook ? { ...enteredScope, ...matchedBook } : enteredScope;
        if (matchedBook) { setGradeSchoolSystem(scope.schoolSystem); setGradeTextbook(scope.textbook); setGradeEdition(scope.edition); setGradeIsbn(scope.isbn); }
        setGradeDraftBusy(true); setMessage(''); setPhotoWarning(''); setGradeDraft({ scope, volumes: [] }); setFailedVolumes([]);
        const successes: GradeDraft['volumes'] = [];
        const failures: ('上册' | '下册')[] = [];
        const failureMessages: string[] = [];
        const requestedVolumes: ('上册' | '下册')[] = matchedBook ? ['上册'] : ['上册', '下册'];
        try {
            setGradeDraftProgress(requestedVolumes.length === 1 ? '正在读取照片中的上册目录…' : '上、下册正在分别生成…');
            await Promise.all(requestedVolumes.map(async volume => {
                try {
                    const result = await apiClient.post<{ volume: '上册' | '下册'; verification: 'ai-draft' | 'user-photo' | 'reference'; units: { title: string; lessons: StudyUnit['lessons']; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest-grade', { ...scope, volume }, { timeout: 150000 });
                    successes.push({ volume, verification: result.verification, units: result.units.map(unit => ({ title: unit.title, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) });
                    setGradeDraft({ scope, volumes: [...successes].sort((a, b) => a.volume === '上册' ? -1 : b.volume === '上册' ? 1 : 0) });
                } catch (error) { failures.push(volume); failureMessages.push(`${volume}：${friendlyApiError(error)}`); setFailedVolumes([...failures]); }
                setGradeDraftProgress(`已完成 ${successes.length}/${requestedVolumes.length} 册，失败 ${failures.length} 册`);
            }));
            setMessage(failures.length ? `${failureMessages.join('；')}。成功的草稿已保留。` : matchedBook ? '已从你提供的教材照片读取上册 9 个目录项；下册 ISBN 不同，未据此推测下册。' : '上、下册草稿已生成，请对照实际教材核对后应用。');
        } finally { setGradeDraftBusy(false); setGradeDraftProgress(''); }
    }
    async function retryVolume(volume: '上册' | '下册') {
        if (!gradeDraft) return;
        setGradeDraftBusy(true); setGradeDraftProgress(`正在重试${volume}…`); setMessage('');
        try {
            const result = await apiClient.post<{ verification: 'ai-draft' | 'user-photo' | 'reference'; units: { title: string; lessons: StudyUnit['lessons']; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest-grade', { ...gradeDraft.scope, volume }, { timeout: 150000 });
            const next = { volume, verification: result.verification, units: result.units.map(unit => ({ title: unit.title, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) };
            setGradeDraft(current => current ? { ...current, volumes: [...current.volumes.filter(item => item.volume !== volume), next].sort((a, b) => a.volume === '上册' ? -1 : b.volume === '上册' ? 1 : 0) } : null);
            setFailedVolumes(current => current.filter(item => item !== volume)); setMessage(`${volume}草稿已生成，请核对后应用。`);
        } catch (error) { setMessage(`${volume}仍未完成：${friendlyApiError(error)}`); }
        finally { setGradeDraftBusy(false); setGradeDraftProgress(''); }
    }
    function updateGradeUnit(volumeIndex: number, unitIndex: number, changes: Partial<GradeDraft['volumes'][number]['units'][number]>) {
        setGradeDraft(current => current ? { ...current, volumes: current.volumes.map((volume, index) => index === volumeIndex ? { ...volume, units: volume.units.map((unit, position) => position === unitIndex ? { ...unit, ...changes } : unit) } : volume) } : null);
    }
    function fillFromPhoto(result: PhotoCatalogResult, region: string, publisher: string, subject: string, grade: string) {
        const scope: GradeDraft['scope'] = { region, publisher, subject, grade, schoolSystem: result.schoolSystem || '', textbook: result.textbook || '', edition: result.edition || '', isbn: result.isbn || '' };
        setGradeSchoolSystem(scope.schoolSystem); setGradeTextbook(scope.textbook); setGradeEdition(scope.edition); setGradeIsbn(scope.isbn);
        if (result.items.length) {
            const volume = result.volume === '下册' ? '下册' : '上册';
            setGradeDraft({ scope, volumes: [{ volume, verification: 'photo-ocr', units: result.items.map(item => ({ title: item.title, lessonText: `${item.title}${item.page ? `｜${item.page}` : ''}`, entryText: '', selected: true })) }] });
        }
    }
    async function generateFromPhotoMetadata(result: PhotoCatalogResult, region: string, publisher: string, subject: string, grade: string) {
        const volume = result.volume === '上册' || result.volume === '下册' ? result.volume : null;
        if (!volume) { setPhotoStatus({ kind: 'partial', text: '已填入教材信息，但照片未识别出上册或下册。请核对册别后再生成，避免把目录放错位置。' }); return; }
        const scope: GradeDraft['scope'] = { region, publisher, subject, grade, schoolSystem: result.schoolSystem || '', textbook: result.textbook || '', edition: result.edition || '', isbn: result.isbn || '' };
        setGradeDraftBusy(true);
        setPhotoStatus({ kind: 'working', text: `已填入教材信息，正在根据出版社、年级、版次和 ISBN 自动匹配${volume}目录…` });
        try {
            const draft = await apiClient.post<{ verification: 'ai-draft' | 'user-photo' | 'reference'; units: { title: string; lessons: StudyUnit['lessons']; entries: StudyUnit['entries'] }[] }>('/api/study-catalog/suggest-grade', { ...scope, volume }, { timeout: 100000 });
            setGradeDraft({ scope, volumes: [{ volume, verification: draft.verification, units: draft.units.map(unit => ({ title: unit.title, lessonText: unit.lessons.map(lesson => `${lesson.title}${lesson.page ? `｜${lesson.page}` : ''}`).join('\n'), entryText: unit.entries.map(entry => `${entry.kind}｜${entry.term}｜${entry.meaning}`).join('\n'), selected: true })) }] });
            setPhotoStatus({ kind: draft.verification === 'user-photo' ? 'success' : 'partial', text: draft.verification === 'user-photo' ? `已自动匹配已有的${volume}照片校对目录，并填入下方预览。请核对后保存。` : draft.verification === 'reference' ? `找到同系列${volume}公开参考目录，已填入下方预览。公开资料未证实与该 ISBN 完全一致，请逐项核对后再保存。` : `已根据识别信息自动生成${volume}目录草稿，并填入下方预览。该草稿不是出版社原版目录，请核对标题后再保存；可补充目录页提高准确性。` });
        } catch (error) {
            setPhotoStatus({ kind: 'partial', text: `教材信息已填入，但没有可靠的${volume}原版目录：${friendlyApiError(error)}。可稍后重试自动匹配，或补充目录页；不会保存占位内容。` });
        } finally { setGradeDraftBusy(false); }
    }
    async function scanCatalogPhotos() {
        if (!selectedRegion || !selectedPublisher || !selectedSubject || !selectedGrade) { setMessage('请先选择地区、出版社、科目和年级，再识别教材照片。'); return; }
        if (!photoFiles.length) { setMessage('请先选择版权页和目录页照片。'); return; }
        setPhotoBusy(true); setMessage(''); setPhotoWarning(''); setPhotoResult(null); setPhotoStatus({ kind: 'working', text: `正在提交 ${photoFiles.length} 张照片，任务提交后刷新页面仍可查看结果…` }); setGradeDraft(null);
        try {
            const images = await Promise.all(photoFiles.map(prepareCatalogImage));
            const task = await apiClient.post<CatalogTask>('/api/study-tasks', { kind: 'catalog-photo', images }, { timeout: 60000 });
            const ref = { id: task.id, region: selectedRegion, publisher: selectedPublisher, subject: selectedSubject, grade: selectedGrade };
            try { localStorage.setItem('catalog-photo-task', JSON.stringify(ref)); } catch { /* Current page can still track the submitted task. */ }
            setPhotoTask(ref);
            setRecentTasks(current => [task, ...current.filter(item => item.id !== task.id)].slice(0, 20));
            setPhotoStatus({ kind: 'working', text: `任务已提交（${task.id.slice(0, 8)}），正在识别。可刷新页面，完成后自动显示预览。` });
        } catch (error) { setPhotoBusy(false); setPhotoStatus({ kind: 'error', text: `无法提交识别任务：${friendlyApiError(error)}` }); }
    }
    useEffect(() => {
        if (!photoTask || !catalog) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const task = await apiClient.get<CatalogTask>(`/api/study-tasks?id=${encodeURIComponent(photoTask.id)}`);
                if (cancelled) return;
                setRecentTasks(current => [task, ...current.filter(item => item.id !== task.id)].slice(0, 20));
                if (task.status === 'pending' || task.status === 'running') {
                    setPhotoBusy(true);
                    setPhotoStatus({ kind: 'working', text: `教材照片识别${task.status === 'pending' ? '等待开始' : '进行中'}，任务 ${task.id.slice(0, 8)}；刷新后仍可继续查看。` });
                    timer = setTimeout(poll, 2500);
                    return;
                }
                localStorage.removeItem('catalog-photo-task');
                setPhotoTask(null); setPhotoBusy(false);
                if (task.status === 'failed' || !task.result) { setPhotoStatus({ kind: 'error', text: `识别未完成：${task.error || '没有返回可用结果'}。可保留照片并重试。` }); return; }
                const result = task.result;
                setPhotoResult(result);
                const warnings = [result.publisher && result.publisher !== photoTask.publisher ? `照片出版社为「${result.publisher}」，提交时筛选为「${photoTask.publisher}」` : '', result.subject && result.subject !== photoTask.subject ? `照片科目为「${result.subject}」，提交时筛选为「${photoTask.subject}」` : '', result.grade && !photoTask.grade.includes(result.grade) && !result.grade.includes(photoTask.grade.replace(/^小学|^初中|^高中/, '')) ? `照片年级为「${result.grade}」，提交时筛选为「${photoTask.grade}」` : ''].filter(Boolean);
                setPhotoWarning(warnings.join('；'));
                if (warnings.length) { setPhotoStatus({ kind: 'partial', text: `已读取 ${result.recognizedPages}/${result.totalPages} 张照片，但${warnings.join('；')}。请先切换到照片对应的教材再应用。` }); return; }
                setSelectedRegion(photoTask.region); setSelectedPublisher(photoTask.publisher); setSelectedSubject(photoTask.subject); setSelectedGrade(photoTask.grade);
                fillFromPhoto(result, photoTask.region, photoTask.publisher, photoTask.subject, photoTask.grade);
                if (!result.items.length) { void generateFromPhotoMetadata(result, photoTask.region, photoTask.publisher, photoTask.subject, photoTask.grade); return; }
                setPhotoStatus({ kind: result.failedPages ? 'partial' : 'success', text: `已识别 ${result.items.length} 个目录项，${result.failedPages ? `${result.failedPages} 张未识别。` : ''}请核对后应用；仅对应${result.volume || '当前'}。` });
            } catch (error) {
                if (!cancelled) { setPhotoBusy(false); setPhotoStatus({ kind: 'error', text: `任务状态读取失败：${friendlyApiError(error)}。稍后刷新可继续查看。` }); }
            }
        };
        void poll();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // The task ID is persistent; only replace the polling loop when that ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photoTask?.id, catalog]);
    async function applyGradeDraft() {
        if (!gradeDraft) return;
        if (photoWarning) { setMessage(`照片与当前筛选不一致：${photoWarning}。请切换到对应出版社和科目后重新识别。`); return; }
        if (!gradeDraft.volumes.length) { setMessage('请先生成至少一册目录草稿。'); return; }
        const volumes = gradeDraft.volumes.map(volume => ({ volume: volume.volume, verification: volume.verification, units: volume.units.filter(unit => unit.selected).map(unit => ({ title: unit.title.trim(), lessons: parseLessons(unit.lessonText), entries: parseEntries(unit.entryText, gradeDraft.scope.subject).map(({ kind, term, meaning }) => ({ kind, term, meaning })) })) }));
        if (volumes.some(volume => !volume.units.length || volume.units.some(unit => !unit.title || !unit.lessons.length))) { setMessage('每个已生成的册别至少保留一个单元，每个单元至少一条课目。'); return; }
        setBusy(true); setMessage('');
        try {
            const result = await apiClient.post<{ addedCourses: number; addedUnits: number }>('/api/study-catalog', { action: 'applyGradeDraft', scope: gradeDraft.scope, volumes });
            const saved = await refresh();
            const persisted = volumes.every(volume => saved.courses.some(course => unitKey(course) === unitKey({ ...gradeDraft.scope, volume: volume.volume })) && volume.units.every(unit => saved.units.some(row => unitKey(row) === unitKey({ ...gradeDraft.scope, volume: volume.volume }) && row.title === unit.title)));
            if (!persisted) { setMessage('目录已提交，但刷新后未能核实保存结果；请勿重复提交，先重新打开科目设置检查。'); return; }
            setGradeDraft(null); setPhotoFiles([]); window.dispatchEvent(new Event('study-units-updated'));
            setMessage(`已保存到当前身份的教材目录：${volumes.map(volume => volume.volume).join('、')}，新增 ${result.addedCourses} 个册别、${result.addedUnits} 个目录项。切换科目只会筛选显示，不会删除已保存目录。`);
        }
        catch (error) { setMessage(friendlyApiError(error)); }
        finally { setBusy(false); }
    }
    async function restoreRevision(id: string) {
        if (!window.confirm('恢复到这次修改之前的教材目录？当前目录会先自动保存为一个可恢复版本。')) return;
        setBusy(true); setMessage('');
        try { await apiClient.post('/api/study-catalog', { action: 'restoreRevision', id }); setSelectedRegion(null); setSelectedPublisher(null); setSelectedSubject(''); setSelectedGrade(''); clearBookContext(); await refresh(); window.dispatchEvent(new Event('study-units-updated')); setMessage('教材目录已恢复；恢复前的版本也已保留。'); }
        catch (error) { setMessage(friendlyApiError(error)); } finally { setBusy(false); }
    }
    if (!catalog) return <div className="rounded-xl border p-5 text-sm text-slate-500">正在读取教学目录…{message && <p role="alert" className="mt-2 text-red-600">{message}</p>}</div>;
    const draftChanges = gradeDraft?.volumes.map(volume => ({ volume: volume.volume, ...catalogDraftDiff({ ...gradeDraft.scope, id: '', volume: volume.volume }, catalog.units, volume.units.filter(unit => unit.selected).map(unit => ({ title: unit.title.trim(), lessons: parseLessons(unit.lessonText), entries: parseEntries(unit.entryText, gradeDraft.scope.subject) }))) })) || [];
    return <div className="space-y-4"><div><h3 className="text-lg font-semibold">科目设置</h3><p className="mt-1 text-xs leading-6 text-slate-500">按地区 → 出版社 → 科目 → 年级和册别管理教材；目录和知识点经核对后可用于 AI 出题及复习。</p></div>
        <div className="space-y-3 rounded-xl border p-4"><div className="grid gap-3 md:grid-cols-3">
            <div><NodeManageMenu label="地区" canAdd canEdit={!!selectedRegion} busy={busy} onAdd={() => openNodeForm('region')} onEdit={() => openNodeForm('region', selectedRegion || '')} onDelete={() => removeNode('region')} /><select aria-label="筛选地区" value={selectedRegion ?? ''} onChange={event => { setSelectedRegion(event.target.value); setSelectedPublisher(''); setSelectedSubject(''); setExpandedCourse(''); clearBookContext(); }} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">未指定地区（旧目录）</option>{catalog.regions.map(name => <option key={name}>{name}</option>)}</select></div>
            <div><NodeManageMenu label="出版社" canAdd={!!selectedRegion} canEdit={!!selectedRegion && !!selectedPublisher} busy={busy} onAdd={() => openNodeForm('publisher')} onEdit={() => openNodeForm('publisher', selectedPublisher || '')} onDelete={() => removeNode('publisher')} /><select aria-label="筛选出版社" value={selectedPublisher ?? ''} onChange={event => { setSelectedPublisher(event.target.value); setSelectedSubject(''); setExpandedCourse(''); clearBookContext(); }} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择出版社</option>{[...new Set(scopedPublishers)].filter(Boolean).map(name => <option key={name}>{name}</option>)}</select></div>
            <div><NodeManageMenu label="科目" canAdd={!!selectedRegion && !!selectedPublisher} canEdit={!!selectedSubject} busy={busy} onAdd={() => openNodeForm('subject')} onEdit={() => openNodeForm('subject', selectedSubject)} onDelete={() => removeNode('subject')} /><select aria-label="筛选科目" value={selectedSubject} onChange={event => { setSelectedSubject(event.target.value); setExpandedCourse(''); clearBookContext(); }} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择科目</option>{[...new Set(scopedSubjects)].map(name => <option key={name}>{name}</option>)}</select></div></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!selectedSubject} onClick={() => startCourse()}>添加年级目录</Button></div>
            {nodeForm && <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3"><label className="min-w-48 flex-1 text-xs">{oldNodeName ? '修改' : '添加'}{nodeForm === 'region' ? '地区' : nodeForm === 'publisher' ? '出版社' : '科目'}<Input className="mt-1" value={nodeName} onChange={event => setNodeName(event.target.value)} maxLength={100} /></label><Button size="sm" disabled={busy} onClick={saveNode}>保存</Button><Button size="sm" variant="ghost" onClick={() => setNodeForm('')}>取消</Button></div>}
            <div className="flex items-center gap-2 text-xs text-slate-500">默认 AI 教材：{catalog.activeRegion || '未指定地区'} · {catalog.activePublisher || '未指定出版社'} <Button size="sm" variant="ghost" disabled={!selectedRegion || busy} onClick={() => mutate('setActiveRegion', { region: selectedRegion }, '默认出题地区已保存。')}>设为默认地区</Button><Button size="sm" variant="ghost" disabled={!selectedPublisher || busy || catalog.activeRegion !== selectedRegion} onClick={() => mutate('setActivePublisher', { publisher: selectedPublisher }, '默认出题出版社已保存。')}>设为默认出版社</Button></div>
        </div>
        {courseForm && <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><p className="text-sm font-medium">{editingCourse ? '修改年级目录' : '添加年级目录'}</p><div className="grid gap-2 sm:grid-cols-5"><label className="text-xs">地区<select aria-label="目录地区" value={courseRegion} onChange={event => { setCourseRegion(event.target.value); setCoursePublisher(''); setCourseSubject(''); }} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择</option>{catalog.regions.map(name => <option key={name}>{name}</option>)}</select></label><label className="text-xs">出版社<select aria-label="目录出版社" value={coursePublisher} onChange={event => { setCoursePublisher(event.target.value); setCourseSubject(''); }} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择</option>{catalog.publisherNodes.filter(node => node.region === courseRegion).map(node => <option key={node.name}>{node.name}</option>)}</select></label><label className="text-xs">科目<select aria-label="目录科目" value={courseSubject} onChange={event => setCourseSubject(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择</option>{catalog.subjectNodes.filter(node => node.region === courseRegion && node.publisher === coursePublisher).map(node => <option key={node.name}>{node.name}</option>)}</select></label><label className="text-xs">年级<select aria-label="目录年级" value={courseGrade} onChange={event => setCourseGrade(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">请选择</option>{Object.values(STUDENT_GRADES).map(grade => <option key={grade}>{grade}</option>)}</select></label><label className="text-xs">册别<select aria-label="目录册别" value={courseVolume} onChange={event => setCourseVolume(event.target.value as Volume)} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm">{['上册', '下册', '全册'].map(volume => <option key={volume}>{volume}</option>)}</select></label></div><div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">学制<select aria-label="目录学制" value={courseSchoolSystem} onChange={event => setCourseSchoolSystem(event.target.value as StudyCourse["schoolSystem"])} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">未指定</option><option value="五四学制">五四学制</option><option value="六三学制">六三学制</option></select></label><label className="block text-xs">教材名称 / 版本<Input className="mt-1" value={courseTextbook} maxLength={100} onChange={event => setCourseTextbook(event.target.value)} /></label></div><div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">版次<Input aria-label="目录版次" className="mt-1" value={courseEdition} maxLength={80} onChange={event => setCourseEdition(event.target.value)} placeholder="例如：2026年7月第1版" /></label><label className="block text-xs">ISBN<Input aria-label="目录ISBN" className="mt-1" value={courseIsbn} maxLength={32} onChange={event => setCourseIsbn(event.target.value)} placeholder="例如：978-7-5720-4337-6" /></label></div><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={saveCourse}>保存</Button><Button size="sm" variant="ghost" onClick={() => setCourseForm(false)}>取消</Button></div></div>}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><div className="mr-auto"><h4 className="text-sm font-semibold">拍照识别教材目录</h4><p className="mt-1 text-xs text-slate-500">可上传版权页和连续目录页（最多 4 张）。识别书名、版次、ISBN、单元和页码；核对后更新。照片只用于本次识别，不保存。</p></div><label className="cursor-pointer rounded-md border px-3 py-2 text-xs hover:bg-slate-50">{photoFiles.length ? '继续添加照片' : '选择照片'}<input aria-label="选择教材照片" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={event => { addPhotoFiles(event.currentTarget.files); event.currentTarget.value = ''; }} /></label><span className="text-xs text-slate-500">已选 {photoFiles.length}/4 张；可分次添加版权页和目录页</span><Button size="sm" disabled={photoBusy || gradeDraftBusy || busy || !photoFiles.length || !selectedRegion || !selectedPublisher || !selectedSubject || !selectedGrade} onClick={scanCatalogPhotos}>{photoBusy ? '正在识别…' : '识别并预览'}</Button>{photoFiles.length > 0 && <Button size="sm" variant="ghost" disabled={photoBusy} onClick={() => { setPhotoFiles([]); setPhotoResult(null); setPhotoStatus(null); setPhotoWarning(''); setGradeDraft(null); }}>清空照片</Button>}</div>
        {photoFiles.length > 0 && <p className="text-xs text-slate-500">待识别：{photoFiles.map(file => file.name).join('、')}</p>}
        {recentTasks.length > 0 && <details className="rounded-xl border p-3 text-xs"><summary className="cursor-pointer font-medium">教材识别任务（最近 {recentTasks.length} 次）</summary><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{recentTasks.map(task => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 p-2"><span>{new Date(task.createdAt).toLocaleString('zh-CN')} · {task.id.slice(0, 8)} · {task.status === 'succeeded' ? '已完成' : task.status === 'failed' ? `失败：${task.error || '识别失败'}` : task.status === 'running' ? '识别中' : '等待开始'}</span>{task.status === 'succeeded' && task.result && <Button size="sm" variant="outline" onClick={() => { setPhotoResult(task.result); setPhotoStatus({ kind: 'success', text: '已打开历史识别结果。请核对教材信息；若需要应用目录，请重新选择对应教材。' }); }}>查看结果</Button>}</div>)}</div></details>}
        {photoStatus && <div role="status" aria-live="polite" className={`rounded-xl border p-4 text-sm ${photoStatus.kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : photoStatus.kind === 'partial' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`}><p className="font-semibold">{photoStatus.kind === 'working' ? '正在识别' : photoStatus.kind === 'error' ? '识别失败' : photoStatus.kind === 'partial' ? '部分识别成功' : '识别成功'}</p><p className="mt-1">{photoStatus.text}</p></div>}
        {photoNeedsContents && photoResult && selectedRegion && selectedPublisher && selectedSubject && selectedGrade && !gradeDraftBusy && <Button size="sm" variant="outline" onClick={() => void generateFromPhotoMetadata(photoResult, selectedRegion, selectedPublisher, selectedSubject, selectedGrade)}>重试自动匹配目录</Button>}
        {photoWarning && photoSwitchAvailable && photoResult && photoTargetGrade && selectedRegion && <Button size="sm" variant="outline" onClick={() => { setSelectedPublisher(photoResult.publisher); setSelectedSubject(photoResult.subject); setSelectedGrade(photoTargetGrade); setExpandedCourse(''); setPhotoWarning(''); fillFromPhoto(photoResult, selectedRegion, photoResult.publisher, photoResult.subject, photoTargetGrade); if (photoResult.items.length) setPhotoStatus({ kind: 'success', text: `已切换到照片中的${photoResult.subject}，教材信息和 ${photoResult.items.length} 个目录项已填入下方。请核对后应用。` }); else void generateFromPhotoMetadata(photoResult, selectedRegion, photoResult.publisher, photoResult.subject, photoTargetGrade); }}>切换到照片中的{photoResult.subject}并填入下方</Button>}
        {photoResult && <div className="space-y-3 rounded-xl border p-4 text-sm"><h4 className="font-semibold">本次识别内容（尚未保存）</h4><div className="grid gap-2 text-slate-700 sm:grid-cols-2 lg:grid-cols-4"><p>出版社：{photoResult.publisher || '未识别'}</p><p>科目：{photoResult.subject || '未识别'}</p><p>年级：{photoResult.grade || '未识别'}</p><p>册别：{photoResult.volume || '未识别'}</p><p>学制：{photoResult.schoolSystem || '未识别'}</p><p>教材全名：{photoResult.textbook || '未识别'}</p><p>版次：{photoResult.edition || '未识别'}</p><p>ISBN：{photoResult.isbn || '未识别'}</p></div><p className="text-xs text-slate-500">目录项：{photoResult.items.length} 条。请与照片逐项核对；只上传版权页时不会出现目录项。</p>{photoResult.items.length > 0 && <ol className="grid gap-1 sm:grid-cols-2">{photoResult.items.map((item, index) => <li key={`${index}-${item.title}`} className="rounded bg-slate-50 px-2 py-1">{item.number || index + 1}. {item.title} <span className="text-slate-500">{item.page ? `第 ${item.page} 页` : '页码未识别'}</span></li>)}</ol>}</div>}
        <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4"><label className="text-xs">筛选年级<select aria-label="筛选年级" value={selectedGrade} onChange={event => { setSelectedGrade(event.target.value); clearBookContext(); }} className="mt-1 block h-9 rounded-md border bg-white px-2 text-sm"><option value="">全部年级</option>{Object.values(STUDENT_GRADES).map(grade => <option key={grade}>{grade}</option>)}</select></label><label className="text-xs">学制<select aria-label="教材学制" value={gradeSchoolSystem} onChange={event => { setGradeSchoolSystem(event.target.value as StudyCourse['schoolSystem']); setGradeDraft(null); }} className="mt-1 block h-9 rounded-md border bg-white px-2 text-sm"><option value="">未填写（可选）</option><option value="五四学制">五四学制</option><option value="六三学制">六三学制</option></select></label><label className="min-w-56 flex-1 text-xs">教材全名<Input aria-label="教材全名" className="mt-1 h-9" maxLength={100} value={gradeTextbook} onChange={event => { setGradeTextbook(event.target.value); setGradeDraft(null); }} placeholder="选填，不清楚可留空" /></label><label className="text-xs">版次<Input aria-label="教材版次" className="mt-1 h-9 w-44" maxLength={80} value={gradeEdition} onChange={event => { setGradeEdition(event.target.value); setGradeDraft(null); }} placeholder="选填，不清楚可留空" /></label><label className="text-xs">ISBN<Input aria-label="教材ISBN" className="mt-1 h-9 w-48" maxLength={32} value={gradeIsbn} onChange={event => { setGradeIsbn(event.target.value); setGradeDraft(null); }} placeholder="选填，不清楚可留空" /></label><span className="text-xs text-slate-500">当前筛选 {courses.length} 个目录 · 全部已保存 {catalog.courses.length} 个</span>{bookFilterActive && <span className="w-full text-xs text-amber-800">当前教材匹配 {matchingCourses.length} 个目录；其他版本或旧草稿 {otherEditionCourses.length} 个，已在下方标明。</span>}<Button size="sm" disabled={!selectedRegion || !selectedPublisher || !selectedSubject || !selectedGrade || gradeDraftBusy || busy || (!!photoFiles.length && !photoNeedsContents)} onClick={() => { if (photoNeedsContents && photoResult && selectedRegion && selectedPublisher && selectedSubject && selectedGrade) void generateFromPhotoMetadata(photoResult, selectedRegion, selectedPublisher, selectedSubject, selectedGrade); else void suggestGrade(); }}>{gradeDraftBusy ? gradeDraftProgress || '正在生成…' : matchingVerifiedTextbook({ region: selectedRegion || '', publisher: selectedPublisher || '', subject: selectedSubject, grade: selectedGrade, schoolSystem: gradeSchoolSystem, textbook: gradeTextbook, edition: gradeEdition, isbn: gradeIsbn }) ? '按照片更新上册目录' : gradeDraft ? '请核对下方草稿' : photoNeedsContents ? '重试自动匹配本册' : photoFiles.length && photoResult?.items.length ? '请核对照片目录' : photoFiles.length ? '请先识别照片' : '查找本册目录'}</Button><p className="w-full text-xs text-slate-500">只需选择地区、出版社、科目和年级。只有版权页时请继续添加目录页；照片识别到真实目录项并核对后才更新。无法核实的内容不会用 AI 猜测填入。</p>{selectedRegion === shanghaiMathFiveFour2026.region && selectedPublisher === shanghaiMathFiveFour2026.publisher && selectedSubject === shanghaiMathFiveFour2026.subject && selectedGrade === shanghaiMathFiveFour2026.grade && <Button size="sm" variant="outline" onClick={() => { setGradeSchoolSystem(shanghaiMathFiveFour2026.schoolSystem); setGradeTextbook(shanghaiMathFiveFour2026.textbook); setGradeEdition(shanghaiMathFiveFour2026.edition); setGradeIsbn(shanghaiMathFiveFour2026.isbn); setGradeDraft(null); }}>填入照片中的五年级上册版本</Button>}</div>
        {gradeDraft && <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"><div><h4 className="text-sm font-semibold">{gradeDraft.scope.region} · {gradeDraft.scope.publisher} · {gradeDraft.scope.subject} · {gradeDraft.scope.grade} · {gradeDraft.scope.schoolSystem} · {gradeDraft.scope.textbook} · {gradeDraft.scope.edition || '未填版次'}：{gradeDraft.volumes.map(volume => volume.volume).join('、')}目录预览</h4><p className="mt-1 text-xs text-indigo-700">照片识别和 AI 草稿都请逐项核对。可修改或取消勾选；应用后只补充缺少的内容，旧目录会保留。</p></div><div className="rounded-lg border border-indigo-200 bg-white p-3 text-xs"><p className="font-semibold text-slate-800">应用前对比 · 仅勾选的目录项</p>{draftChanges.map(change => <div key={change.volume} className="mt-2 space-y-1"><p className="font-medium">{change.volume}：新增 {change.additions.filter(item => item.kind === 'unit').length} 个单元，已有单元补充 {change.additions.filter(item => item.kind === 'content').length} 个；{change.unchanged} 个无新增，{change.preserved} 个原有单元保留</p>{change.additions.map(item => <p key={item.title} className="text-emerald-700">＋ {item.title}：{item.kind === 'unit' ? '新增单元' : '补充内容'}，新增 {item.lessons} 课目、{item.entries} 知识点</p>)}{change.conflicts.length > 0 && <details className="text-amber-800"><summary className="cursor-pointer">{change.conflicts.length} 处与已存内容不一致（保存时不会覆盖）</summary><ul className="mt-1 list-inside list-disc">{change.conflicts.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details>}</div>)}</div>{failedVolumes.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700">未完成：{failedVolumes.map(volume => <Button key={volume} size="sm" variant="outline" disabled={gradeDraftBusy} onClick={() => retryVolume(volume)}>重试{volume}</Button>)}</div>}{gradeDraftBusy && <p role="status" className="text-xs text-indigo-700">{gradeDraftProgress}</p>}{failedVolumes.length > 0 && message && <p role="alert" className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}{photoWarning && <p role="alert" className="text-xs text-red-600">照片与当前筛选不一致：{photoWarning}。请切换筛选后重新识别。</p>}{gradeDraft.volumes.some(volume => volume.verification === 'photo-ocr') && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs">教材全名（可选）<Input className="mt-1" value={gradeDraft.scope.textbook} onChange={event => setGradeDraft(current => current ? { ...current, scope: { ...current.scope, textbook: event.target.value } } : null)} /></label><label className="text-xs">学制（可选）<select value={gradeDraft.scope.schoolSystem} onChange={event => setGradeDraft(current => current ? { ...current, scope: { ...current.scope, schoolSystem: event.target.value as StudyCourse['schoolSystem'] } } : null)} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="">未识别</option><option value="五四学制">五四学制</option><option value="六三学制">六三学制</option></select></label><label className="text-xs">版次（可选）<Input className="mt-1" value={gradeDraft.scope.edition} onChange={event => setGradeDraft(current => current ? { ...current, scope: { ...current.scope, edition: event.target.value } } : null)} /></label><label className="text-xs">ISBN（可选）<Input className="mt-1" value={gradeDraft.scope.isbn} onChange={event => setGradeDraft(current => current ? { ...current, scope: { ...current.scope, isbn: event.target.value } } : null)} /></label><label className="text-xs">册别<select aria-label="识别结果册别" value={gradeDraft.volumes[0]?.volume || '上册'} onChange={event => setGradeDraft(current => current ? { ...current, volumes: current.volumes.map(volume => ({ ...volume, volume: event.target.value as '上册' | '下册' })) } : null)} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm"><option value="上册">上册</option><option value="下册">下册</option></select></label></div>}<div className="grid gap-3 lg:grid-cols-2">{gradeDraft.volumes.map((volume, volumeIndex) => <div key={volume.volume} className="space-y-2 rounded-lg border bg-white p-3"><h5 className="font-medium">{volume.volume} · {volume.units.length} 个目录项</h5><p className="text-xs text-slate-500">{volume.verification === 'user-photo' ? '来源：用户提供的教材目录照片；知识点尚未核验' : volume.verification === 'reference' ? <>来源：<a className="underline" href={shanghaiEnglishFiveFourReferenceUrl} target="_blank" rel="noopener noreferrer">公开参考目录</a>；单元标题来自公开资料，知识点为学习目标草稿；未核实与本书 ISBN 完全一致，请逐项核对</> : volume.verification === 'photo-ocr' ? '来源：本次照片识别，请逐项核对标题与页码' : 'AI 草稿，请对照教材核对'}</p>{volume.units.map((unit, unitIndex) => <div key={`${volume.volume}-${unitIndex}`} className="rounded-lg border p-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unit.selected} onChange={event => updateGradeUnit(volumeIndex, unitIndex, { selected: event.target.checked })} />{unit.title}</label><details className="mt-2"><summary className="cursor-pointer text-xs text-indigo-600">核对并修改</summary><div className="mt-2 space-y-2"><Input aria-label={`${volume.volume}第${unitIndex + 1}单元名称`} value={unit.title} onChange={event => updateGradeUnit(volumeIndex, unitIndex, { title: event.target.value })} /><Textarea aria-label={`${volume.volume}${unit.title}课目`} value={unit.lessonText} onChange={event => updateGradeUnit(volumeIndex, unitIndex, { lessonText: event.target.value })} placeholder="每行：课目名称｜页码" /><Textarea aria-label={`${volume.volume}${unit.title}知识点`} value={unit.entryText} onChange={event => updateGradeUnit(volumeIndex, unitIndex, { entryText: event.target.value })} placeholder="每行：类型｜名称｜核心内容" /></div></details></div>)}</div>)}</div><div className="flex gap-2"><Button size="sm" disabled={busy || gradeDraftBusy || !gradeDraft.volumes.length} onClick={applyGradeDraft}>核对后更新目录</Button><Button size="sm" variant="ghost" onClick={() => setGradeDraft(null)}>取消</Button></div></div>}
<div className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between"><h4 className="text-sm font-semibold">教材目录</h4><span className="text-xs text-slate-500">{courses.length} 个目录（全部已保存 {catalog.courses.length} 个）{(selectedSubject || selectedGrade) ? ' · 清除科目和年级筛选后可调整目录顺序' : ''}</span></div>
            {!courses.length && selectedSubject !== '数学' && savedMathCourses.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><span>当前筛选的{selectedSubject || '科目'}没有已保存目录。数学{[...new Set(savedMathCourses.map(course => course.volume))].join('、')}目录及知识点仍已保存。</span><Button size="sm" variant="outline" onClick={() => { setSelectedSubject('数学'); setExpandedCourse(''); clearBookContext(); }}>查看数学上下册</Button></div>}
            <details className="rounded-lg border bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-medium">目录修改历史与恢复（最近 {revisions.length} 次）</summary><p className="mt-2 text-slate-500">恢复只影响教材目录、单元与知识点；不会覆盖练习记录和账户其他设置。每次修改前都会保留一个版本。</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{revisions.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white p-2"><span>{new Date(item.createdAt).toLocaleString('zh-CN')} · {item.action}之前：{item.courses} 册、{item.units} 单元、{item.entries} 条学习内容</span><Button size="sm" variant="outline" disabled={busy} onClick={() => restoreRevision(item.id)}>恢复此版本</Button></div>)}{!revisions.length && <p>还没有目录修改历史。</p>}</div></details>
            <div className="space-y-2">{[...matchingCourses, ...otherEditionCourses].map((course, courseIndex) => { const belongsToCurrentBook = !bookFilterActive || matchesBook(course, { schoolSystem: gradeSchoolSystem, textbook: gradeTextbook, edition: gradeEdition, isbn: gradeIsbn }); const units = catalog.units.filter(unit => unitKey(unit) === unitKey(course)); const expanded = expandedCourse === course.id; return <div key={course.id} className="rounded-lg border"><div className="flex flex-wrap items-center justify-between gap-2 p-3"><button type="button" aria-expanded={expanded} className="flex-1 text-left" onClick={() => { setExpandedCourse(expanded ? '' : course.id); setUnitCourse(''); }}><span className="text-sm font-medium">{course.region || '未指定地区'} · {course.publisher || '未指定出版社'} · {course.subject} · {course.grade} · {course.volume || '未分册'}</span>{!belongsToCurrentBook && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">其他版本／旧草稿，未匹配当前教材</span>}<span className="ml-2 text-xs text-slate-500">{course.schoolSystem || '未指定学制'} · {course.textbook || '未填写教材全名'} · {course.edition || '未填版次'} · ISBN {course.isbn || '未填'} · {units.length} 单元、{units.reduce((total, unit) => total + unit.entries.length, 0)} 条学习内容 · {course.verification === 'photo-ocr' ? '目录经照片识别，请核对知识点' : course.verification === 'manual' ? '人工录入' : '历史目录，来源未记录'}{course.savedAt ? ` · ${new Date(course.savedAt).toLocaleDateString('zh-CN')}保存` : ''} {expanded ? '▴' : '▾'}</span></button><button type="button" aria-label="上移目录" disabled={busy || !!selectedSubject || !!selectedGrade || courseIndex === 0} className="text-xs text-indigo-600 disabled:opacity-30" onClick={() => moveItem('moveCourse', course.id, 'up')}>↑</button><button type="button" aria-label="下移目录" disabled={busy || !!selectedSubject || !!selectedGrade || courseIndex === courses.length - 1} className="text-xs text-indigo-600 disabled:opacity-30" onClick={() => moveItem('moveCourse', course.id, 'down')}>↓</button><button type="button" disabled={busy} className="text-xs text-indigo-600 disabled:opacity-40" onClick={() => suggestCourse(course)}>{busy && suggestedCatalog?.courseId === course.id ? '生成中…' : '匹配已核对目录'}</button>{(course.volume === "上册" || course.volume === "下册") && <button type="button" disabled={busy || !units.length || !course.schoolSystem || !course.textbook} className="text-xs text-indigo-600 disabled:opacity-40" onClick={() => suggestRelated(course, "companion")}>查找{course.volume === "上册" ? "下册" : "上册"}来源</button>}<button type="button" disabled={busy || !units.length || !course.schoolSystem || !course.textbook} className="text-xs text-indigo-600 disabled:opacity-40" onClick={() => suggestRelated(course, "knowledge")}>知识点来源说明</button><button type="button" className="text-xs text-indigo-600" onClick={() => startCourse(course)}>修改</button><button type="button" disabled={busy} className="text-xs text-red-500" onClick={() => removeCourse(course)}>删除</button></div>{expanded && <div className="space-y-2 border-t p-3"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">单元目录</p><button type="button" className="text-xs text-indigo-600" onClick={() => startUnit(course)}>＋添加单元</button></div>{suggestedCatalog?.courseId === course.id && <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3"><div><p className="text-sm font-medium text-indigo-800">{suggestedCatalog.mode === "knowledge" ? "AI 知识点更新草稿" : "AI 生成的目录与知识点草稿"}</p><p className="mt-1 text-xs text-indigo-700">按地区、出版社、科目、年级和册别生成，尚未经教材原文核对。可修改、取消勾选后再应用；不会删除已有单元或覆盖手工课目。</p></div>{suggestedCatalog.units.map((unit, index) => <div key={`${unit.title}-${index}`} className="rounded-lg border bg-white p-3"><div className="flex items-center gap-2"><input type="checkbox" aria-label={`应用${unit.title}`} checked={unit.selected} onChange={event => updateSuggestedUnit(index, { selected: event.target.checked })} /><span className="text-sm font-medium">{unit.title}</span><span className="text-xs text-slate-500">{unit.lessons.length} 课目 · {unit.entries.length} 条知识点</span></div><details className="mt-2"><summary className="cursor-pointer text-xs text-indigo-600">核对并修改</summary><div className="mt-2 space-y-2"><Input aria-label={`第${index + 1}单元名称`} value={unit.title} maxLength={100} onChange={event => updateSuggestedUnit(index, { title: event.target.value })} /><Textarea aria-label={`${unit.title}课目目录`} value={unit.lessonText} onChange={event => updateSuggestedUnit(index, { lessonText: event.target.value })} className="min-h-28" /><p className="text-xs text-slate-500">每行“课目名称｜页码”；无法核实的页码可留空。</p><Textarea aria-label={`${unit.title}知识点`} value={unit.entryText} onChange={event => updateSuggestedUnit(index, { entryText: event.target.value })} className="min-h-28" /><p className="text-xs text-slate-500">每行“类型｜内容｜释义”，应用前请核对。</p></div></details></div>)}<div className="flex gap-2"><Button size="sm" disabled={busy} onClick={applySuggestion}>{suggestedCatalog.mode === "knowledge" ? "核对后更新知识点" : "核对后应用目录与知识点"}</Button><Button size="sm" variant="ghost" onClick={() => setSuggestedCatalog(null)}>取消</Button></div></div>}{units.map((unit, unitIndex) => <div key={unit.id} className="rounded-lg border bg-slate-50 text-sm"><div className="flex flex-wrap items-center justify-between gap-2 p-3"><button type="button" aria-expanded={expandedUnit === unit.id} className="min-w-0 flex-1 text-left" onClick={() => setExpandedUnit(expandedUnit === unit.id ? '' : unit.id)}><span className="font-medium">{unit.title}</span><span className="ml-2 text-xs text-slate-500">{unit.lessons.length} 课目 · {unit.entries.length} 条知识点{unit.entries.length === 0 ? ' · 未核对原文，暂不用于单元出题' : ''}</span></button><div className="flex shrink-0 gap-2"><button type="button" aria-label="上移单元" disabled={busy || unitIndex === 0} className="text-xs text-indigo-600 disabled:opacity-30" onClick={() => moveItem('moveUnit', unit.id, 'up')}>↑</button><button type="button" aria-label="下移单元" disabled={busy || unitIndex === units.length - 1} className="text-xs text-indigo-600 disabled:opacity-30" onClick={() => moveItem('moveUnit', unit.id, 'down')}>↓</button><button type="button" className="text-xs text-indigo-600" onClick={() => setExpandedUnit(expandedUnit === unit.id ? '' : unit.id)}>{expandedUnit === unit.id ? '收起' : '打开'}</button><button type="button" className="text-xs text-indigo-600" onClick={() => startUnit(course, unit)}>编辑</button><button type="button" disabled={busy} className="text-xs text-red-500" onClick={() => removeUnit(unit)}>删除</button></div></div>{expandedUnit === unit.id && <div className="space-y-2 border-t bg-white p-3"><p className="text-xs font-medium text-slate-500">课目目录</p>{unit.lessons.map((lesson, index) => <div key={`${lesson.title}-${index}`} className="flex items-center gap-3 border-b border-dotted py-2 last:border-0"><span className="w-6 shrink-0 text-xs text-slate-400">{index + 1}</span><span className="min-w-0 flex-1">{lesson.title}</span><span className="text-xs text-slate-500">{lesson.page ? `第 ${lesson.page} 页` : ''}</span></div>)}{!unit.lessons.length && <p className="text-xs text-slate-400">尚未录入课目目录。</p>}{unit.entries.length > 0 && <p className="pt-2 text-xs text-slate-500">另有 {unit.entries.length} 条学习内容，其中 {unit.entries.filter(entry => entry.mastered).length} 条已掌握。</p>}</div>}</div>)}{!units.length && <p className="text-xs text-slate-500">还没有单元，点击“添加单元”录入课目目录或知识点。</p>}
                {unitCourse === course.id && <div className="space-y-2 rounded-lg border bg-white p-3"><label className="block text-xs">单元名称<Input className="mt-1" value={unitTitle} maxLength={100} onChange={event => setUnitTitle(event.target.value)} placeholder="例如：Unit 1 / 第一单元" /></label><label className="block text-xs">课目目录 · 每行“课目名称｜页码”<Textarea className="mt-1 min-h-28" value={unitLessons} maxLength={16000} onChange={event => setUnitLessons(event.target.value)} placeholder={'桂花雨｜1\n落花生｜3\n珍珠鸟｜5'} /></label><label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-xs hover:bg-slate-50">{knowledgePhotoBusy ? '正在识别教材内容…' : '拍照识别本单元词表/知识点'}<input aria-label="选择单元学习内容照片" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={knowledgePhotoBusy || !unitTitle.trim()} className="sr-only" onChange={event => { void scanKnowledgePhotos(event.currentTarget.files); event.currentTarget.value = ''; }} /></label><p className="text-xs text-slate-500">最多 4 张词表、句型或单元总结页；只提取照片上可见的原文和对应释义，识别后请核对。</p><label className="block text-xs">学习内容（选填）· 每行“类型｜内容｜释义”<Textarea className="mt-1 min-h-32" value={unitLines} maxLength={30000} onChange={event => setUnitLines(event.target.value)} placeholder={'单词｜useful｜有用的\n短语｜take photos｜拍照\n句子｜A pencil is useful.｜铅笔很有用。'} /></label><p className="text-xs text-slate-500">可只添加目录课目，稍后再补知识点。目录页码只作索引，不代表已录入课文原文。</p><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => saveUnit(course)}>{editingUnit ? '保存修改' : '保存单元'}</Button><Button size="sm" variant="ghost" onClick={() => setUnitCourse('')}>取消</Button></div></div>}</div>}</div>; })}{bookFilterActive && !matchingCourses.length && otherEditionCourses.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">下列已保存目录缺少或不符合当前教材的学制、书名、版次或 ISBN，不能作为本书目录用于自动匹配。它们仍保留在原位置，待核对后可修改或删除。</p>}{!courses.length && <p className="rounded-lg bg-slate-50 p-4 text-xs text-slate-500">当前筛选下没有目录，可以调整筛选条件或添加科目年级。</p>}</div>
        </div>{message && <p role="status" className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">{message}</p>}
    </div>;
}










