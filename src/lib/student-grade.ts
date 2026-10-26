export const STUDENT_GRADES: Record<number, string> = { 1: '小学一年级', 2: '小学二年级', 3: '小学三年级', 4: '小学四年级', 5: '小学五年级', 6: '小学六年级', 7: '初一', 8: '初二', 9: '初三', 10: '高一', 11: '高二', 12: '高三', 13: '大一', 14: '大二', 15: '大三', 16: '大四', 17: '研究生' };
export interface GradeProfile { currentGrade?: number | null; educationStage?: string | null; enrollmentYear?: number | null; examDate?: string | null }
export function shanghaiDate(now = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now); }
export function currentStudentGrade(profile: GradeProfile, now = new Date()): number | null {
    if (profile.currentGrade && STUDENT_GRADES[profile.currentGrade]) return profile.currentGrade;
    if (!profile.educationStage || !profile.enrollmentYear) return null;
    const [year, month] = shanghaiDate(now).split('-').map(Number);
    const level = year - profile.enrollmentYear + (month >= 9 ? 1 : 0);
    const stages: Record<string, [number, number]> = { primary: [0, 6], junior_high: [6, 3], senior_high: [9, 3], university: [12, 4] };
    const stage = stages[profile.educationStage];
    return stage && level >= 1 && level <= stage[1] ? stage[0] + level : null;
}
export function gradeStage(grade: number) { return grade <= 6 ? 'primary' : grade <= 9 ? 'junior_high' : grade <= 12 ? 'senior_high' : 'university'; }
export function examCountdown(profile: GradeProfile, now = new Date()) {
    const grade = currentStudentGrade(profile, now);
    const label = grade ? STUDENT_GRADES[grade] : '';
    if (!grade || grade < 7 || grade > 12) return { grade, gradeLabel: label, exam: null, date: null, days: null, estimated: false, targetYear: null };
    const today = shanghaiDate(now);
    const [year, month] = today.split('-').map(Number);
    const high = grade >= 10;
    const targetYear = profile.examDate ? Number(profile.examDate.slice(0, 4)) : year + (month >= 9 ? 1 : 0) + ((high ? 12 : 9) - grade);
    const date = profile.examDate || (high ? `${targetYear}-06-07` : null);
    const days = date ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
    return { grade, gradeLabel: label, exam: high ? '高考' : '中考', date, days, estimated: !profile.examDate && high, targetYear };
}

export function examCountdowns(profile: GradeProfile, now = new Date()) {
    const grade = currentStudentGrade(profile, now);
    if (!grade || grade > 12) return [];
    const today = shanghaiDate(now);
    const [year, month] = today.split('-').map(Number);
    return ([{ end: 9, name: '中考', day: '06-15' }, { end: 12, name: '高考', day: '06-07' }] as const)
        .filter(exam => grade <= exam.end).map(exam => {
            const targetYear = year + (month >= 9 ? 1 : 0) + exam.end - grade;
            const custom = !!profile.examDate && (grade <= 9 ? exam.end === 9 : exam.end === 12);
            const date = custom ? profile.examDate! : targetYear + '-' + exam.day;
            return { exam: exam.name, targetYear: Number(date.slice(0,4)), date, estimated: !custom,
                days: Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) };
        });
}
