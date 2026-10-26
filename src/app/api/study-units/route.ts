import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { studyPreferences, storedStudyPreferences, studyUnitSchema } from '@/lib/study-preferences';
import { currentStudentGrade, STUDENT_GRADES } from '@/lib/student-grade';
import { courseIdentity } from '@/lib/study-catalog';

const unitInput = studyUnitSchema.omit({ id: true });
async function context() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, currentGrade: true, educationStage: true, enrollmentYear: true, studyPreferences: true } });
    return user;
}
async function save(user: NonNullable<Awaited<ReturnType<typeof context>>>, units: ReturnType<typeof studyPreferences>['studyUnits']) {
    const preferences = storedStudyPreferences(user.studyPreferences);
    return prisma.$transaction(async tx => {
        const result = await tx.user.updateMany({ where: { id: user.id, studyPreferences: user.studyPreferences }, data: { studyPreferences: JSON.stringify({ ...preferences, studyUnits: units }) } });
        if (!result.count) return false;
        await tx.studyCatalogRevision.create({ data: { userId: user.id, action: '修改单元与知识点', snapshot: user.studyPreferences } });
        return true;
    });
}
export async function GET() {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const grade = currentStudentGrade(user);
    const preferences = studyPreferences(user.studyPreferences);
    return NextResponse.json({ units: preferences.studyUnits, courses: preferences.studyCourses, activePublisher: preferences.activePublisher, grade: grade ? STUDENT_GRADES[grade] : '', textbooks: preferences.subjectTextbooks });
}
export async function POST(req: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = unitInput.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ message: '请填写单元名称和至少一条学习内容' }, { status: 400 });
    if (!parsed.data.lessons.length && !parsed.data.entries.length) return NextResponse.json({ message: '请至少填写一条课目或知识点' }, { status: 400 });
    const preferences = studyPreferences(user.studyPreferences);
    if (preferences.studyUnits.length >= 80) return NextResponse.json({ message: '单元已达上限' }, { status: 400 });
    if (preferences.studyUnits.some(item => courseIdentity(item) === courseIdentity(parsed.data) && item.title === parsed.data.title)) return NextResponse.json({ message: '该教材和册别已有同名单元，请编辑现有单元' }, { status: 409 });
    const unit = { ...parsed.data, id: randomUUID() };
    if (!await save(user, [...preferences.studyUnits, unit])) return NextResponse.json({ message: '学习计划已更新，请刷新后重试' }, { status: 409 });
    return NextResponse.json(unit);
}
export async function PUT(req: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = unitInput.extend({ id: z.string().min(1) }).safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ message: '请填写有效的单元内容' }, { status: 400 });
    if (!parsed.data.lessons.length && !parsed.data.entries.length) return NextResponse.json({ message: '请至少保留一条课目或知识点' }, { status: 400 });
    const preferences = studyPreferences(user.studyPreferences);
    const previous = preferences.studyUnits.find(item => item.id === parsed.data.id);
    if (!previous) return NextResponse.json({ message: '单元不存在' }, { status: 404 });
    if (preferences.studyUnits.some(item => item.id !== previous.id && courseIdentity(item) === courseIdentity(parsed.data) && item.title === parsed.data.title)) return NextResponse.json({ message: '该教材和册别已有同名单元' }, { status: 409 });
    const { id, ...changes } = parsed.data;
    const units = preferences.studyUnits.map(item => item.id === id ? { ...changes, id } : item);
    if (!await save(user, units)) return NextResponse.json({ message: '学习计划已更新，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ ok: true });
}
export async function PATCH(req: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const parsed = z.object({ id: z.string(), entryIndex: z.number().int().min(0).max(119), mastered: z.boolean() }).safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ message: '学习进度无效' }, { status: 400 });
    const preferences = studyPreferences(user.studyPreferences);
    const unit = preferences.studyUnits.find(item => item.id === parsed.data.id);
    if (!unit || !unit.entries[parsed.data.entryIndex]) return NextResponse.json({ message: '单元内容不存在' }, { status: 404 });
    const units = preferences.studyUnits.map(item => item.id === unit.id ? { ...item, entries: item.entries.map((entry, index) => index === parsed.data.entryIndex ? { ...entry, mastered: parsed.data.mastered } : entry) } : item);
    if (!await save(user, units)) return NextResponse.json({ message: '学习计划已更新，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ ok: true });
}
export async function DELETE(req: Request) {
    const user = await context();
    if (!user) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const id = new URL(req.url).searchParams.get('id');
    const preferences = studyPreferences(user.studyPreferences);
    if (!preferences.studyUnits.some(item => item.id === id)) return NextResponse.json({ message: '单元不存在' }, { status: 404 });
    if (!await save(user, preferences.studyUnits.filter(item => item.id !== id))) return NextResponse.json({ message: '学习计划已更新，请刷新后重试' }, { status: 409 });
    return NextResponse.json({ ok: true });
}
