import { describe, it, expect } from 'vitest';
import { currentStudentGrade, examCountdown, examCountdowns } from '@/lib/student-grade';

describe('current grade and exam countdown', () => {
    const now = new Date('2026-10-09T04:00:00Z');
    it('prioritizes the explicitly selected grade over enrollment-year inference', () => {
        expect(currentStudentGrade({ currentGrade: 12, educationStage: 'junior_high', enrollmentYear: 2025 }, now)).toBe(12);
        expect(currentStudentGrade({ educationStage: 'junior_high', enrollmentYear: 2025 }, now)).toBe(8);
    });
    it('uses the Shanghai academic-year boundary in September', () => {
        const profile = { educationStage: 'junior_high', enrollmentYear: 2025 };
        expect(currentStudentGrade(profile, new Date('2026-08-31T15:59:59Z'))).toBe(7);
        expect(currentStudentGrade(profile, new Date('2026-08-31T16:00:00Z'))).toBe(8);
    });
    it('marks future gaokao dates as estimates and infers the graduation year', () => {
        expect(examCountdown({ currentGrade: 11 }, now)).toMatchObject({ exam: '高考', date: '2028-06-07', estimated: true });
        expect(examCountdown({ currentGrade: 12 }, now).date).toBe('2027-06-07');
    });
    it('does not invent one uniform date for all regional zhongkao exams', () => {
        expect(examCountdown({ currentGrade: 8 }, now)).toMatchObject({ exam: '中考', targetYear: 2028, date: null, days: null });
    });
    it('honors a custom date and counts calendar days at Shanghai midnight', () => {
        const profile = { currentGrade: 9, examDate: '2026-10-10' };
        expect(examCountdown(profile, new Date('2026-10-09T15:59:59Z')).days).toBe(1);
        expect(examCountdown(profile, new Date('2026-10-09T16:00:00Z')).days).toBe(0);
        expect(examCountdown(profile, new Date('2026-10-10T16:00:00Z')).days).toBe(-1);
    });
    it('does not show a fabricated entrance-exam countdown for primary or university students', () => {
        expect(examCountdown({ currentGrade: 4 }, now).exam).toBe(null);
        expect(examCountdown({ currentGrade: 13 }, now).exam).toBe(null);
    });
});

it('estimates both graduation exams from primary grade five and keeps custom middle dates separate',()=>{
 const now=new Date('2026-10-09T04:00:00Z');
 expect(examCountdowns({currentGrade:5},now).map(e=>e.date)).toEqual(['2031-06-15','2034-06-07']);
 const exams=examCountdowns({currentGrade:8,examDate:'2028-06-20'},now);
 expect(exams[0]).toMatchObject({date:'2028-06-20',estimated:false});
 expect(exams[1]).toMatchObject({date:'2031-06-07',estimated:true});
 expect(examCountdowns({currentGrade:11},now)).toHaveLength(1);
});
