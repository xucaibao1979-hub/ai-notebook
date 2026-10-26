import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { hash } from "bcryptjs";
import { unauthorized, notFound, badRequest, validationError, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";
import { mergeProfileStudyPreferences, storedStudyPreferences, studyPreferencesSchema } from '@/lib/study-preferences';
import { currentStudentGrade, gradeStage, STUDENT_GRADES } from '@/lib/student-grade';

const logger = createLogger('api:user');

const userUpdateSchema = z.object({
    studyPreferences: studyPreferencesSchema.optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    password: z.string().optional(),
    educationStage: z.string().optional(),
    enrollmentYear: z.number().optional().nullable(),
    currentGrade: z.number().int().min(1).max(17).optional().nullable(),
    examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
        const date = new Date(`${value}T00:00:00Z`);
        return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, '考试日期无效').optional().nullable(),
});

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: {
                name: true,
                email: true,
                educationStage: true,
                enrollmentYear: true,
                currentGrade: true,
                examDate: true,
                studyPreferences: true,
                // Do not return password
            }
        });

        if (!user) {
            return notFound("User not found");
        }

        logger.debug({ user }, 'Returning user profile');

        return NextResponse.json(user);
    } catch (error) {
        logger.error({ error }, 'Failed to fetch user profile');
        return internalError("Failed to fetch user profile");
    }
}

export async function PATCH(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return unauthorized();
    }

    try {
        const body = await req.json();
        const { name, email, password, educationStage, enrollmentYear, currentGrade, examDate, studyPreferences } = userUpdateSchema.parse(body);

        if(session.user.accountId&&session.user.id!==session.user.accountId&&email?.trim()&&email.trim()!==session.user.email)return badRequest('学习身份通过主账号切换，不需要修改登录邮箱');
        const current = await prisma.user.findUnique({ where: { email: session.user.email }, select: { studyPreferences: true, currentGrade: true, educationStage: true, enrollmentYear: true } });
        if (!current) return notFound('User not found');
        const savedPreferences = storedStudyPreferences(current.studyPreferences);
        const gradeNumber = currentGrade === undefined ? currentStudentGrade(current) : currentGrade;
        const gradeLabel = gradeNumber ? STUDENT_GRADES[gradeNumber] : '';
        const updateData: any = {};
        if (studyPreferences || currentGrade !== undefined) updateData.studyPreferences = JSON.stringify(mergeProfileStudyPreferences(savedPreferences, studyPreferences, gradeLabel));
        if (currentGrade !== undefined) {
            updateData.currentGrade = currentGrade;
            if (currentGrade !== null) updateData.educationStage = gradeStage(currentGrade);
        }
        if (examDate !== undefined) updateData.examDate = examDate;

        // 只有非空字符串才会触发更新
        if (name && name.trim()) updateData.name = name.trim();
        if (educationStage && educationStage.trim() && !currentGrade) updateData.educationStage = educationStage.trim();
        if (typeof enrollmentYear === 'number' && !isNaN(enrollmentYear)) {
            updateData.enrollmentYear = enrollmentYear;
        }

        // 验证邮箱格式（如果提供了邮箱）
        // 支持标准邮箱和本地邮箱（如 admin@localhost）
        if (email && email.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+$/;
            if (!emailRegex.test(email.trim())) {
                return badRequest("Invalid email format");
            }
            updateData.email = email.trim();
        }

        // 验证密码长度（如果提供了密码）
        if (password && password.length > 0) {
            if (password.length < 6) {
                return badRequest("Password must be at least 6 characters");
            }
            updateData.password = await hash(password, 10);
        }

        const updatedUser = await prisma.user.update({
            where: { email: session.user.email, ...(updateData.studyPreferences ? { studyPreferences: current.studyPreferences } : {}) },
            data: updateData,
            select: {
                name: true,
                email: true,
                educationStage: true,
                enrollmentYear: true,
                currentGrade: true,
                examDate: true,
                studyPreferences: true,
            }
        });

        return NextResponse.json(updatedUser);
    } catch (error) {
        logger.error({ error }, 'Failed to update user profile');
        if (error instanceof z.ZodError) {
            return validationError("Invalid input", error.issues);
        }
        if (error instanceof Error && 'code' in error && error.code === 'P2025') {
            return NextResponse.json({ message: '学习设置已在其他页面更新，请刷新后重试' }, { status: 409 });
        }
        return internalError("Failed to update user profile");
    }
}
