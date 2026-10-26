import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), createRevision: vi.fn(), findRevisions: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => { const prisma = { user: { findUnique: mocks.findUser, updateMany: mocks.updateUser }, studyCatalogRevision: { create: mocks.createRevision, findMany: mocks.findRevisions }, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma) }; return { prisma }; });

import { DELETE, GET, POST } from '@/app/api/study-catalog/route';

const first = { id: 'u1', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册', textbook: '第一版', title: 'Unit 1', entries: [{ kind: '单词', term: 'book', meaning: '书', mastered: false }] };
const second = { ...first, id: 'u2', publisher: '乙出版社', title: 'Unit 2' };
const user = { id: 'learner-a', currentGrade: 5, educationStage: 'primary', enrollmentYear: null, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社', '乙出版社'], studyUnits: [first, second] }) };

describe('study catalog', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'learner-a' } }); mocks.findUser.mockResolvedValue(user); mocks.updateUser.mockResolvedValue({ count: 1 }); mocks.createRevision.mockResolvedValue({ id: 'revision-1' }); mocks.findRevisions.mockResolvedValue([]); });
    it('shows legacy units in publisher and course directories', async () => {
        const response = await GET();
        const body = await response.json();
        expect(body.publishers).toEqual(['甲出版社', '乙出版社']);
        expect(body.courses).toHaveLength(2);
        expect(body.courses[0]).toMatchObject({ publisher: '甲出版社', subject: '英语', grade: '小学五年级' });
    });
    it('creates a region and keeps old courses in the unspecified region', async () => {
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'addRegion', region: '北京' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyRegions).toContain('北京');
        expect(saved.studyUnits[0].region).toBe('');
    });
    it('deletes a region with its descendants without deleting old-region data', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '英语' }], studyCourses: [{ id: 'c1', region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册' }], studyUnits: [{ ...first, id: 'regional', region: '北京' }, first] }) });
        const response = await DELETE(new Request('http://localhost/api/study-catalog?type=region&name=%E5%8C%97%E4%BA%AC'));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyUnits.map((unit: { id: string }) => unit.id)).toEqual(['u1']);
        expect(saved.studyCourses).toEqual([]);
    });
    it('renames a subject within one region and updates its course and units', async () => {
        const regional = { ...first, region: '北京' };
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '英语' }], studyCourses: [{ id: 'c1', region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册' }], studyUnits: [regional, first] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'editSubjectNode', region: '北京', publisher: '甲出版社', oldName: '英语', name: '外语' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyCourses[0].subject).toBe('外语');
        expect(saved.studyUnits.map((unit: { subject: string }) => unit.subject)).toEqual(['外语', '英语']);
    });
    it('applies upper and lower volume drafts together and preserves an existing unit', async () => {
        const existing = { ...first, region: '北京', textbook: '教材', schoolSystem: '五四学制', lessons: [{ title: '手工课目', page: '' }] };
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '英语' }], studyCourses: [{ id: 'upper', region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册', textbook: '教材', schoolSystem: '五四学制' }], studyUnits: [existing] }) });
        const scope = { region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级', textbook: '教材', schoolSystem: '五四学制' };
        const volumes = [{ volume: '上册', verification: 'photo-ocr', units: [{ title: 'Unit 1', lessons: [{ title: '新课目', page: '' }], entries: [{ kind: '单词', term: 'club', meaning: '社团' }] }] }, { volume: '下册', verification: 'photo-ocr', units: [{ title: 'Unit 1', lessons: [{ title: '下册课目', page: '' }], entries: [] }] }];
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'applyGradeDraft', scope, volumes }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyCourses).toHaveLength(2);
        expect(saved.studyUnits).toHaveLength(2);
        expect(saved.studyUnits[0].lessons.map((item: { title: string }) => item.title)).toEqual(['手工课目', '新课目']);
        expect(saved.studyUnits[0].entries.map((item: { term: string }) => item.term)).toEqual(['book', 'club']);
        expect(saved.studyUnits[1]).toMatchObject({ volume: '下册', region: '北京', title: 'Unit 1' });
    });
    it('accepts a photographed catalog even when book title, edition, and ISBN were unreadable', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '数学' }] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'applyGradeDraft', scope: { region: '北京', publisher: '甲出版社', subject: '数学', grade: '小学五年级' }, volumes: [{ volume: '上册', verification: 'photo-ocr', units: [{ title: '小数的应用', lessons: [{ title: '小数的应用', page: '23' }], entries: [] }] }] }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyCourses[0]).toMatchObject({ textbook: '', edition: '', isbn: '' });
        expect(saved.studyUnits[0].lessons[0].page).toBe('23');
    });
    it('does not save an AI placeholder as a textbook unit', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyRegions: ['北京'], studyPublisherNodes: [{ region: '北京', name: '甲出版社' }], studySubjectNodes: [{ region: '北京', publisher: '甲出版社', name: '英语' }] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'applyGradeDraft', scope: { region: '北京', publisher: '甲出版社', subject: '英语', grade: '小学五年级' }, volumes: [{ volume: '上册', units: [{ title: '待核对单元（原版目录未确认）', lessons: [{ title: '请对照教材', page: '' }], entries: [] }] }] }) }));
        expect(response.status).toBe(422);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('shows an older subject textbook as a course under the current grade', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ activeGrade: '小学五年级', subjectTextbooks: [{ subject: '语文', publisher: '甲出版社', textbook: '五年级教材' }], studyUnits: [] }) });
        const body = await (await GET()).json();
        expect(body.courses).toMatchObject([{ publisher: '甲出版社', subject: '语文', grade: '小学五年级', textbook: '五年级教材' }]);
    });
    it('adds a separate subject-grade directory without requiring a unit', async () => {
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'addCourse', course: { publisher: '甲出版社', subject: '数学', grade: '小学五年级', volume: '下册', textbook: '新版' } }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyCourses).toMatchObject([{ publisher: '甲出版社', subject: '数学', grade: '小学五年级', volume: '下册' }]);
        expect(saved.studyUnits).toHaveLength(2);
    });
    it('renames a publisher and keeps its units and active selection linked', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社', '乙出版社'], activePublisher: '甲出版社', studyUnits: [first, second] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'editPublisher', oldName: '甲出版社', publisher: '新版出版社' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyPublishers).toEqual(['新版出版社', '乙出版社']);
        expect(saved.studyUnits.map((unit: { publisher: string }) => unit.publisher)).toEqual(['新版出版社', '乙出版社']);
        expect(saved.activePublisher).toBe('新版出版社');
    });
    it('edits a legacy course and moves its unit under the new grade and volume', async () => {
        const listed = await (await GET()).json();
        const course = listed.courses.find((item: { publisher: string }) => item.publisher === '甲出版社');
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'editCourse', id: course.id, course: { publisher: '甲出版社', subject: '英语', grade: '小学六年级', volume: '下册', textbook: '新版教材' } }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyUnits[0]).toMatchObject({ id: 'u1', grade: '小学六年级', volume: '下册', textbook: '新版教材' });
        expect(saved.studyUnits[1]).toMatchObject({ id: 'u2', grade: '小学五年级' });
        expect(saved.studyCourses).toMatchObject([{ grade: '小学六年级', volume: '下册' }]);
    });
    it('moves a unit within its own course without changing another publisher', async () => {
        const nextUnit = { ...first, id: 'u3', title: 'Unit 3' };
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社', '乙出版社'], studyUnits: [first, second, nextUnit] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'moveUnit', id: 'u3', direction: 'up' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyUnits.map((unit: { id: string }) => unit.id)).toEqual(['u3', 'u2', 'u1']);
    });
    it('moves a course within a publisher while preserving another publisher order', async () => {
        const courses = [
            { id: 'c1', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册', textbook: '' },
            { id: 'c2', publisher: '乙出版社', subject: '语文', grade: '小学五年级', volume: '上册', textbook: '' },
            { id: 'c3', publisher: '甲出版社', subject: '数学', grade: '小学五年级', volume: '下册', textbook: '' },
        ];
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社', '乙出版社'], studyCourses: courses, studyUnits: [] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'moveCourse', id: 'c3', direction: 'up' }) }));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyCourses.map((course: { id: string }) => course.id)).toEqual(['c3', 'c2', 'c1']);
    });
    it('rejects an English catalog draft without source-photo verification', async () => {
        const course = { id: 'course-1', publisher: '甲出版社', subject: '英语', grade: '小学五年级', volume: '上册', textbook: '第一版' };
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社', '乙出版社'], studyCourses: [course], studyUnits: [first, second] }) });
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'applyCatalogDraft', courseId: course.id, course, units: [{ title: 'Unit 1', lessons: [{ title: 'Clubs', page: '' }] }, { title: 'Unit 2', lessons: [{ title: 'Hobbies', page: '' }] }] }) }));
        expect(response.status).toBe(422);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
    it('deletes only the selected publisher and its units', async () => {
        const response = await DELETE(new Request('http://localhost/api/study-catalog?type=publisher&name=%E7%94%B2%E5%87%BA%E7%89%88%E7%A4%BE'));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyPublishers).toEqual(['乙出版社']);
        expect(saved.studyUnits.map((unit: { id: string }) => unit.id)).toEqual(['u2']);
    });
    it('removes legacy textbook rows with a deleted publisher', async () => {
        mocks.findUser.mockResolvedValue({ ...user, studyPreferences: JSON.stringify({ studyPublishers: ['甲出版社'], subjectTextbooks: [{ subject: '语文', publisher: '甲出版社', textbook: '旧版' }] }) });
        const response = await DELETE(new Request('http://localhost/api/study-catalog?type=publisher&name=%E7%94%B2%E5%87%BA%E7%89%88%E7%A4%BE'));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.subjectTextbooks).toEqual([]);
    });
    it('deletes one legacy course and keeps another publisher intact', async () => {
        const listed = await (await GET()).json();
        const course = listed.courses.find((item: { publisher: string }) => item.publisher === '甲出版社');
        const response = await DELETE(new Request(`http://localhost/api/study-catalog?type=course&id=${encodeURIComponent(course.id)}`));
        expect(response.status).toBe(200);
        const saved = JSON.parse(mocks.updateUser.mock.calls[0][0].data.studyPreferences);
        expect(saved.studyUnits.map((unit: { id: string }) => unit.id)).toEqual(['u2']);
        expect(saved.studyPublishers).toEqual(['甲出版社', '乙出版社']);
    });
    it('rejects unauthenticated catalog changes', async () => {
        mocks.session.mockResolvedValue(null);
        const response = await POST(new Request('http://localhost/api/study-catalog', { method: 'POST', body: JSON.stringify({ action: 'addPublisher', publisher: '丙出版社' }) }));
        expect(response.status).toBe(401);
        expect(mocks.updateUser).not.toHaveBeenCalled();
    });
});
