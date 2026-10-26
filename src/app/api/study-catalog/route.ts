import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { catalogCourses, catalogPublishers, catalogPublisherNodes, catalogRegions, catalogSubjectNodes, courseIdentity } from '@/lib/study-catalog';
import { catalogDraftSchema, mergeCatalogDraft } from '@/lib/catalog-draft';
import { gradeCatalogDraftSchema } from '@/lib/grade-catalog-draft';
import { studyPreferences, studyPreferencesSchema, storedStudyPreferences } from '@/lib/study-preferences';
import { currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';

async function context() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, currentGrade: true, educationStage: true, enrollmentYear: true, studyPreferences: true } });
}
function preferencesFor(user: NonNullable<Awaited<ReturnType<typeof context>>>) {
    const preferences = storedStudyPreferences(user.studyPreferences);
    const grade = currentStudentGrade(user);
    return { ...preferences, activeGrade: preferences.activeGrade || (grade ? STUDENT_GRADES[grade] : '') };
}
async function save(user: NonNullable<Awaited<ReturnType<typeof context>>>, changes: Partial<ReturnType<typeof studyPreferences>>, action = '修改教材目录') {
    const preferences = preferencesFor(user);
    const next = studyPreferencesSchema.parse({ ...preferences, ...changes });
    return prisma.$transaction(async tx => {
        const result = await tx.user.updateMany({ where: { id: user.id, studyPreferences: user.studyPreferences }, data: { studyPreferences: JSON.stringify(next) } });
        if (!result.count) return false;
        await tx.studyCatalogRevision.create({ data: { userId: user.id, action, snapshot: user.studyPreferences } });
        return true;
    });
}
const publisherInput = z.string().trim().min(1).max(100);
const regionInput = z.string().trim().min(1).max(80);
const subjectInput = z.string().trim().min(1).max(50);
const courseInput = z.object({ region: z.string().trim().max(80).default(''), publisher: publisherInput, subject: subjectInput, grade: z.string().trim().min(1).max(80), volume: z.enum(['', '上册', '下册', '全册']), textbook: z.string().trim().max(100).default(''), schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''), edition: z.string().trim().max(80).default(''), isbn: z.string().trim().max(32).default('') });
export async function GET(request?: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    if (request && new URL(request.url).searchParams.get('revisions') === '1') {
        const rows = await prisma.studyCatalogRevision.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 });
        return NextResponse.json({ items: rows.map(row => { const previous = studyPreferences(row.snapshot); return { id: row.id, action: row.action, createdAt: row.createdAt, courses: previous.studyCourses.length, units: previous.studyUnits.length, entries: previous.studyUnits.reduce((sum, unit) => sum + unit.entries.length, 0) }; }) });
    }
    const preferences = preferencesFor(user);
    const grade = currentStudentGrade(user);
    return NextResponse.json({ regions: catalogRegions(preferences), publisherNodes: catalogPublisherNodes(preferences), subjectNodes: catalogSubjectNodes(preferences), publishers: catalogPublishers(preferences), courses: catalogCourses(preferences), units: preferences.studyUnits, activeRegion: preferences.activeRegion, activePublisher: preferences.activePublisher, dailyMinutes: preferences.dailyMinutes, grade: grade ? STUDENT_GRADES[grade] : '' });
}
export async function POST(request: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const body = await request.json().catch(() => null);
    const preferences = preferencesFor(user);
    if (body?.action === 'restoreRevision') {
        const id = typeof body.id === 'string' ? body.id : '';
        const revision = await prisma.studyCatalogRevision.findFirst({ where: { id, userId: user.id } });
        if (!revision) return NextResponse.json({ message: '历史版本不存在' }, { status: 404 });
        const old = studyPreferences(revision.snapshot);
        const catalog = { studyRegions: old.studyRegions, studyPublisherNodes: old.studyPublisherNodes, studySubjectNodes: old.studySubjectNodes, studyPublishers: old.studyPublishers, studyCourses: old.studyCourses, studyUnits: old.studyUnits, activeRegion: old.activeRegion, activePublisher: old.activePublisher };
        if (!await save(user, catalog, '恢复目录历史版本')) return NextResponse.json({ message: '目录已变化，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'addRegion' || body?.action === 'editRegion') {
        const region = regionInput.safeParse(body.region);
        const oldName = regionInput.safeParse(body.oldName);
        if (!region.success || (body.action === 'editRegion' && !oldName.success)) return NextResponse.json({ message: '请填写有效的地区名称' }, { status: 400 });
        const regions = catalogRegions(preferences);
        if (body.action === 'editRegion' && !regions.includes(oldName.data!)) return NextResponse.json({ message: '地区不存在' }, { status: 404 });
        if (regions.includes(region.data) && (body.action === 'addRegion' || oldName.data !== region.data)) return NextResponse.json({ message: '地区已存在' }, { status: 409 });
        if (body.action === 'addRegion' && regions.length >= 50) return NextResponse.json({ message: '地区已达上限' }, { status: 400 });
        const rename = (value: string) => body.action === 'editRegion' && value === oldName.data ? region.data : value;
        if (!await save(user, { studyRegions: [...new Set([...preferences.studyRegions.map(rename), region.data])], studyPublisherNodes: preferences.studyPublisherNodes.map(node => ({ ...node, region: rename(node.region) })), studySubjectNodes: preferences.studySubjectNodes.map(node => ({ ...node, region: rename(node.region) })), studyCourses: preferences.studyCourses.map(course => ({ ...course, region: rename(course.region) })), studyUnits: preferences.studyUnits.map(unit => ({ ...unit, region: rename(unit.region) })), activeRegion: rename(preferences.activeRegion) })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'addPublisherNode' || body?.action === 'editPublisherNode') {
        const parsed = z.object({ region: regionInput, name: publisherInput, oldName: publisherInput.optional() }).safeParse(body);
        if (!parsed.success || !catalogRegions(preferences).includes(parsed.data.region)) return NextResponse.json({ message: '请先选择地区和出版社' }, { status: 400 });
        const { region, name, oldName } = parsed.data;
        const nodes = catalogPublisherNodes(preferences);
        if (body.action === 'editPublisherNode' && !nodes.some(node => node.region === region && node.name === oldName)) return NextResponse.json({ message: '出版社不存在' }, { status: 404 });
        if (nodes.some(node => node.region === region && node.name === name) && (body.action === 'addPublisherNode' || oldName !== name)) return NextResponse.json({ message: '出版社已存在' }, { status: 409 });
        const rename = (value: string) => body.action === 'editPublisherNode' && value === oldName ? name : value;
        if (!await save(user, { studyPublisherNodes: [...nodes.filter(node => !(node.region === region && node.name === oldName)), { region, name }], studySubjectNodes: preferences.studySubjectNodes.map(node => node.region === region ? { ...node, publisher: rename(node.publisher) } : node), studyCourses: preferences.studyCourses.map(course => course.region === region ? { ...course, publisher: rename(course.publisher) } : course), studyUnits: preferences.studyUnits.map(unit => unit.region === region ? { ...unit, publisher: rename(unit.publisher) } : unit), activePublisher: preferences.activeRegion === region ? rename(preferences.activePublisher) : preferences.activePublisher })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'addSubjectNode' || body?.action === 'editSubjectNode') {
        const parsed = z.object({ region: regionInput, publisher: publisherInput, name: subjectInput, oldName: subjectInput.optional() }).safeParse(body);
        if (!parsed.success || !catalogPublisherNodes(preferences).some(node => node.region === parsed.data.region && node.name === parsed.data.publisher)) return NextResponse.json({ message: '请先选择地区和出版社' }, { status: 400 });
        const { region, publisher, name, oldName } = parsed.data;
        const nodes = catalogSubjectNodes(preferences);
        if (body.action === 'editSubjectNode' && !nodes.some(node => node.region === region && node.publisher === publisher && node.name === oldName)) return NextResponse.json({ message: '科目不存在' }, { status: 404 });
        if (nodes.some(node => node.region === region && node.publisher === publisher && node.name === name) && (body.action === 'addSubjectNode' || oldName !== name)) return NextResponse.json({ message: '科目已存在' }, { status: 409 });
        const rename = (value: string) => body.action === 'editSubjectNode' && value === oldName ? name : value;
        if (!await save(user, { studySubjectNodes: [...nodes.filter(node => !(node.region === region && node.publisher === publisher && node.name === oldName)), { region, publisher, name }], studyCourses: preferences.studyCourses.map(course => course.region === region && course.publisher === publisher ? { ...course, subject: rename(course.subject) } : course), studyUnits: preferences.studyUnits.map(unit => unit.region === region && unit.publisher === publisher ? { ...unit, subject: rename(unit.subject) } : unit) })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'addPublisher') {
        const parsed = publisherInput.safeParse(body.publisher);
        if (!parsed.success) return NextResponse.json({ message: '请填写出版社名称' }, { status: 400 });
        if (catalogPublishers(preferences).includes(parsed.data)) return NextResponse.json({ message: '出版社已存在' }, { status: 409 });
        if (catalogPublishers(preferences).length >= 40) return NextResponse.json({ message: '出版社已达上限' }, { status: 400 });
        if (!await save(user, { studyPublishers: [...preferences.studyPublishers, parsed.data] })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'editPublisher') {
        const oldName = publisherInput.safeParse(body.oldName);
        const newName = publisherInput.safeParse(body.publisher);
        if (!oldName.success || !newName.success) return NextResponse.json({ message: '请填写有效的出版社名称' }, { status: 400 });
        const publishers = catalogPublishers(preferences);
        if (!publishers.includes(oldName.data)) return NextResponse.json({ message: '出版社不存在' }, { status: 404 });
        if (oldName.data !== newName.data && publishers.includes(newName.data)) return NextResponse.json({ message: '出版社已存在' }, { status: 409 });
        const rename = (name: string) => name === oldName.data ? newName.data : name;
        const changes = {
            studyPublishers: [...new Set([...preferences.studyPublishers.map(rename), newName.data])],
            studyCourses: preferences.studyCourses.map(course => ({ ...course, publisher: rename(course.publisher) })),
            studyUnits: preferences.studyUnits.map(unit => ({ ...unit, publisher: rename(unit.publisher) })),
            subjectTextbooks: preferences.subjectTextbooks.map(row => ({ ...row, publisher: rename(row.publisher) })),
            activePublisher: rename(preferences.activePublisher),
        };
        if (!await save(user, changes)) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'addCourse') {
        const parsed = courseInput.safeParse(body.course);
        if (!parsed.success || !Object.values(STUDENT_GRADES).includes(parsed.data?.grade || '')) return NextResponse.json({ message: '请选择有效的科目、年级和册别' }, { status: 400 });
        if (parsed.data.region && !catalogSubjectNodes(preferences).some(node => node.region === parsed.data.region && node.publisher === parsed.data.publisher && node.name === parsed.data.subject)) return NextResponse.json({ message: '请先按地区添加出版社和科目' }, { status: 400 });
        if (!parsed.data.region && !catalogPublishers(preferences).includes(parsed.data.publisher)) return NextResponse.json({ message: '请先添加出版社' }, { status: 400 });
        if (catalogCourses(preferences).some(course => courseIdentity(course) === courseIdentity(parsed.data))) return NextResponse.json({ message: '这个科目、年级和册别已存在' }, { status: 409 });
        if (catalogCourses(preferences).length >= 120) return NextResponse.json({ message: '教材目录已达上限' }, { status: 400 });
        if (!await save(user, { studyCourses: [...preferences.studyCourses, { ...parsed.data, id: randomUUID(), verification: 'manual', savedAt: new Date().toISOString() }] }, '添加年级目录')) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'editCourse') {
        const parsed = courseInput.safeParse(body.course);
        const previous = catalogCourses(preferences).find(course => course.id === body.id);
        if (!previous) return NextResponse.json({ message: '目录不存在' }, { status: 404 });
        if (!parsed.success || !Object.values(STUDENT_GRADES).includes(parsed.data.grade)) return NextResponse.json({ message: '请选择有效的科目、年级和册别' }, { status: 400 });
        if (parsed.data.region && !catalogSubjectNodes(preferences).some(node => node.region === parsed.data.region && node.publisher === parsed.data.publisher && node.name === parsed.data.subject)) return NextResponse.json({ message: '请先按地区添加出版社和科目' }, { status: 400 });
        if (!parsed.data.region && !catalogPublishers(preferences).includes(parsed.data.publisher)) return NextResponse.json({ message: '请先添加出版社' }, { status: 400 });
        const oldKey = courseIdentity(previous);
        const newKey = courseIdentity(parsed.data);
        if (oldKey !== newKey && catalogCourses(preferences).some(course => courseIdentity(course) === newKey)) return NextResponse.json({ message: '这个科目、年级和册别已存在' }, { status: 409 });
        const id = preferences.studyCourses.find(course => courseIdentity(course) === oldKey)?.id || randomUUID();
        const changes = {
            studyCourses: [...preferences.studyCourses.filter(course => courseIdentity(course) !== oldKey), { ...parsed.data, id, verification: previous.verification || 'manual', savedAt: new Date().toISOString() }],
            studyUnits: preferences.studyUnits.map(unit => courseIdentity(unit) === oldKey ? { ...unit, ...parsed.data } : unit),
            subjectTextbooks: preferences.subjectTextbooks.filter(row => !(previous.volume === '' && row.publisher === previous.publisher && row.subject === previous.subject && preferences.activeGrade === previous.grade)),
        };
        if (!await save(user, changes, '修改年级目录')) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true, id });
    }
    if (body?.action === 'moveCourse' || body?.action === 'moveUnit') {
        const id = typeof body.id === 'string' ? body.id : '';
        const direction = body.direction === 'up' ? -1 : body.direction === 'down' ? 1 : 0;
        if (!id || !direction) return NextResponse.json({ message: '移动参数无效' }, { status: 400 });
        if (body.action === 'moveCourse') {
            const ordered = catalogCourses(preferences);
            const index = ordered.findIndex(course => course.id === id);
            if (index < 0) return NextResponse.json({ message: '目录不存在' }, { status: 404 });
            const siblings = ordered.map((course, position) => ({ course, position })).filter(item => item.course.publisher === ordered[index].publisher);
            const siblingIndex = siblings.findIndex(item => item.position === index);
            const neighbor = siblings[siblingIndex + direction];
            if (!neighbor) return NextResponse.json({ message: '已经在最前或最后' }, { status: 400 });
            [ordered[index], ordered[neighbor.position]] = [ordered[neighbor.position], ordered[index]];
            if (!await save(user, { studyCourses: ordered.map(course => ({ ...course, id: course.id.startsWith('legacy-') ? randomUUID() : course.id })) })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        } else {
            const ordered = [...preferences.studyUnits];
            const index = ordered.findIndex(unit => unit.id === id);
            if (index < 0) return NextResponse.json({ message: '单元不存在' }, { status: 404 });
            const key = courseIdentity(ordered[index]);
            const siblings = ordered.map((unit, position) => ({ unit, position })).filter(item => courseIdentity(item.unit) === key);
            const siblingIndex = siblings.findIndex(item => item.position === index);
            const neighbor = siblings[siblingIndex + direction];
            if (!neighbor) return NextResponse.json({ message: '已经在最前或最后' }, { status: 400 });
            [ordered[index], ordered[neighbor.position]] = [ordered[neighbor.position], ordered[index]];
            if (!await save(user, { studyUnits: ordered })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        }
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'applyKnowledgeDraft') {
        return NextResponse.json({ message: '单元标题无法核实教材知识点。请编辑单元并上传教材词表或总结页识别，核对后保存。' }, { status: 422 });
    }
    if (body?.action === 'applyCatalogDraft') {
        if (body?.course?.subject === '英语') return NextResponse.json({ message: '英语教材目录草稿没有原书依据，不能直接保存。请使用目录页照片识别，或手动录入书上的英文标题。' }, { status: 422 });
        const parsed = z.object({ courseId: z.string().min(1), course: courseInput, units: catalogDraftSchema.shape.units }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ message: '目录草稿无效' }, { status: 400 });
        const course = catalogCourses(preferences).find(item => item.id === parsed.data.courseId);
        if (!course) return NextResponse.json({ message: '教材目录不存在' }, { status: 404 });
        if (courseIdentity(course) !== courseIdentity(parsed.data.course) || course.textbook !== parsed.data.course.textbook) return NextResponse.json({ message: '教材信息已变化，请重新生成目录草稿' }, { status: 409 });
        const studyUnits = mergeCatalogDraft(course, preferences.studyUnits, { units: parsed.data.units });
        if (studyUnits.length > 80) return NextResponse.json({ message: '单元总数超过 80 个，请减少草稿内容' }, { status: 400 });
        if (!await save(user, { studyUnits })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true, added: studyUnits.length - preferences.studyUnits.length });
    }
    if (body?.action === 'applyGradeDraft') {
        if (!Array.isArray(body.volumes) || body.volumes.some((volume: { verification?: string }) => volume.verification !== 'photo-ocr' && volume.verification !== 'user-photo')) return NextResponse.json({ message: '这份目录没有本册教材照片依据，不能作为原版目录保存。请上传目录页识别并核对。' }, { status: 422 });
        const parsed = z.object({ scope: z.object({ region: regionInput, publisher: publisherInput, subject: subjectInput, grade: z.string().trim().min(1).max(80), schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''), textbook: z.string().trim().max(100).default(''), edition: z.string().trim().max(80).default(''), isbn: z.string().trim().max(32).default('') }), volumes: gradeCatalogDraftSchema.shape.volumes }).safeParse(body);
        if (!parsed.success || !Object.values(STUDENT_GRADES).includes(parsed.data.scope.grade)) return NextResponse.json({ message: '上下册目录草稿无效' }, { status: 400 });
        const { scope, volumes } = parsed.data;
          if (volumes.some(volume => volume.units.some(unit => /待核对|未确认|占位|示例|无法确认|未提供/.test(unit.title)))) return NextResponse.json({ message: '目录仍包含占位单元，请上传对应目录页或先修改为教材上的真实标题' }, { status: 422 });
        if (!catalogSubjectNodes(preferences).some(node => node.region === scope.region && node.publisher === scope.publisher && node.name === scope.subject)) return NextResponse.json({ message: '地区、出版社或科目已变化，请重新生成草稿' }, { status: 409 });
        if (new Set(volumes.map(item => item.volume)).size !== volumes.length) return NextResponse.json({ message: '册别不能重复' }, { status: 400 });
        const current = catalogCourses(preferences);
        const sameCourse = (course: typeof current[number], volume: string) => course.region === scope.region && course.publisher === scope.publisher && course.subject === scope.subject && course.grade === scope.grade && course.volume === volume && course.schoolSystem === scope.schoolSystem && course.textbook === scope.textbook && course.edition === scope.edition && course.isbn.replace(/[^0-9X]/gi, '') === scope.isbn.replace(/[^0-9X]/gi, '');
        const addedCourses = volumes.filter(item => !current.some(course => sameCourse(course, item.volume)));
        if (current.length + addedCourses.length > 120) return NextResponse.json({ message: '教材目录已达上限' }, { status: 400 });
        const appliedAt = new Date().toISOString();
        const studyCourses = [...preferences.studyCourses.map(course => volumes.some(item => sameCourse(course, item.volume)) ? { ...course, verification: 'photo-ocr' as const, savedAt: appliedAt } : course), ...addedCourses.map(item => ({ ...scope, id: randomUUID(), volume: item.volume, verification: 'photo-ocr' as const, savedAt: appliedAt }))];
        let studyUnits = preferences.studyUnits;
        for (const item of volumes) {
            const course = current.find(course => sameCourse(course, item.volume)) || studyCourses.find(course => sameCourse(course, item.volume));
            if (!course) return NextResponse.json({ message: '教材目录不存在' }, { status: 404 });
            studyUnits = mergeCatalogDraft(course, studyUnits, { units: item.units });
        }
        if (studyUnits.length > 80) return NextResponse.json({ message: '单元总数超过 80 个，请减少草稿内容' }, { status: 400 });
        if (!await save(user, { studyCourses, studyUnits }, '按照片更新目录')) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true, addedCourses: addedCourses.length, addedUnits: studyUnits.length - preferences.studyUnits.length });
    }
    if (body?.action === 'setActivePublisher') {
        const publisher = typeof body.publisher === 'string' ? body.publisher.trim() : '';
        if (publisher && !catalogPublisherNodes(preferences).some(node => node.name === publisher && node.region === preferences.activeRegion)) return NextResponse.json({ message: '出版社不存在' }, { status: 404 });
        if (!await save(user, { activePublisher: publisher })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'setActiveRegion') {
        const region = typeof body.region === 'string' ? body.region.trim() : '';
        if (region && !catalogRegions(preferences).includes(region)) return NextResponse.json({ message: '地区不存在' }, { status: 404 });
        if (!await save(user, { activeRegion: region, activePublisher: '' })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action === 'setDailyMinutes') {
        const minutes = z.number().int().min(5).max(180).safeParse(body.minutes);
        if (!minutes.success) return NextResponse.json({ message: '每天学习时长应为 5–180 分钟' }, { status: 400 });
        if (!await save(user, { dailyMinutes: minutes.data })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ message: '不支持的目录操作' }, { status: 400 });
}
export async function DELETE(request: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const preferences = preferencesFor(user);
    const params = new URL(request.url).searchParams;
    if (params.get('type') === 'region') {
        const region = params.get('name') || '';
        if (!catalogRegions(preferences).includes(region)) return NextResponse.json({ message: '地区不存在' }, { status: 404 });
        if (!await save(user, { studyRegions: preferences.studyRegions.filter(item => item !== region), studyPublisherNodes: preferences.studyPublisherNodes.filter(node => node.region !== region), studySubjectNodes: preferences.studySubjectNodes.filter(node => node.region !== region), studyCourses: preferences.studyCourses.filter(course => course.region !== region), studyUnits: preferences.studyUnits.filter(unit => unit.region !== region), activeRegion: preferences.activeRegion === region ? '' : preferences.activeRegion, activePublisher: preferences.activeRegion === region ? '' : preferences.activePublisher })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (params.get('type') === 'publisherNode') {
        const region = params.get('region') || '', name = params.get('name') || '';
        if (!catalogPublisherNodes(preferences).some(node => node.region === region && node.name === name)) return NextResponse.json({ message: '出版社不存在' }, { status: 404 });
        if (!await save(user, { studyPublisherNodes: preferences.studyPublisherNodes.filter(node => !(node.region === region && node.name === name)), studySubjectNodes: preferences.studySubjectNodes.filter(node => !(node.region === region && node.publisher === name)), studyCourses: preferences.studyCourses.filter(course => !(course.region === region && course.publisher === name)), studyUnits: preferences.studyUnits.filter(unit => !(unit.region === region && unit.publisher === name)), activePublisher: preferences.activeRegion === region && preferences.activePublisher === name ? '' : preferences.activePublisher })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (params.get('type') === 'subjectNode') {
        const region = params.get('region') || '', publisher = params.get('publisher') || '', name = params.get('name') || '';
        if (!catalogSubjectNodes(preferences).some(node => node.region === region && node.publisher === publisher && node.name === name)) return NextResponse.json({ message: '科目不存在' }, { status: 404 });
        if (!await save(user, { studySubjectNodes: preferences.studySubjectNodes.filter(node => !(node.region === region && node.publisher === publisher && node.name === name)), studyCourses: preferences.studyCourses.filter(course => !(course.region === region && course.publisher === publisher && course.subject === name)), studyUnits: preferences.studyUnits.filter(unit => !(unit.region === region && unit.publisher === publisher && unit.subject === name)) })) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (params.get('type') === 'course') {
        const course = catalogCourses(preferences).find(item => item.id === params.get('id'));
        if (!course) return NextResponse.json({ message: '目录不存在' }, { status: 404 });
        const key = courseIdentity(course);
        const changes = { studyCourses: preferences.studyCourses.filter(item => courseIdentity(item) !== key), studyUnits: preferences.studyUnits.filter(item => courseIdentity(item) !== key), subjectTextbooks: preferences.subjectTextbooks.filter(row => !(course.volume === '' && row.publisher === course.publisher && row.subject === course.subject && preferences.activeGrade === course.grade)) };
        if (!await save(user, changes)) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    if (params.get('type') === 'publisher') {
        const publisher = params.get('name') || '';
        if (!catalogPublishers(preferences).includes(publisher) && !(publisher === '' && (preferences.studyUnits.some(unit => !unit.publisher) || preferences.studyCourses.some(course => !course.publisher)))) return NextResponse.json({ message: '出版社不存在' }, { status: 404 });
        const changes = {
            studyPublishers: preferences.studyPublishers.filter(item => item !== publisher),
            studyCourses: preferences.studyCourses.filter(item => item.publisher !== publisher),
            studyUnits: preferences.studyUnits.filter(item => item.publisher !== publisher),
            subjectTextbooks: preferences.subjectTextbooks.filter(row => row.publisher !== publisher),
            activePublisher: preferences.activePublisher === publisher ? '' : preferences.activePublisher,
        };
        if (!await save(user, changes)) return NextResponse.json({ message: '目录已更新，请刷新后重试' }, { status: 409 });
        return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ message: '不支持的目录操作' }, { status: 400 });
}

