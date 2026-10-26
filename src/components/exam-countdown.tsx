"use client";

import { useEffect, useState } from 'react';
import { CalendarDays, GraduationCap, Settings2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { GradeProfile, examCountdown, examCountdowns } from '@/lib/student-grade';

export function ExamCountdown() {
    const [profile, setProfile] = useState<GradeProfile | null>(null);
    const [now, setNow] = useState(new Date());
    const [error, setError] = useState(false);
    useEffect(() => {
        apiClient.get<GradeProfile>('/api/user').then(setProfile).catch(() => setError(true));
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);
    if (!profile && !error) return <div className="mb-6 rounded-2xl border bg-white p-5 text-sm text-slate-400">正在加载年级与考试安排…</div>;
    const countdown = examCountdown(profile || {}, now);
    const exams = examCountdowns(profile || {}, now);
    return <section className="mb-6 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-white p-6">
        <div><p className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-600"><GraduationCap className="size-5" />{countdown.gradeLabel ? `${countdown.gradeLabel} · 学习目标` : '设置你的学习目标'}</p><h2 className="text-xl font-semibold text-slate-800">{exams.length ? '升学考试倒计时' : '设置当前年级'}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{error ? '年级信息加载失败，请刷新页面重试。' : '按当前年级及每年九月升学计算毕业年份；推荐练习同步匹配课程范围。'}</p><button className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-500" onClick={() => window.dispatchEvent(new CustomEvent('open-app-settings', { detail: { tab: 'account' } }))}><Settings2 className="size-3.5" />修改年级或考试日期</button></div>
        <div className="flex flex-wrap gap-6">{exams.map(item => <div key={item.exam} className="min-w-44"><p className="mb-2 text-sm font-semibold text-indigo-700">{item.exam}倒计时</p><div className="flex items-center gap-3"><CalendarDays className="size-8 shrink-0 text-indigo-300" /><p className="text-4xl font-semibold text-indigo-600">{Math.max(0, item.days)}<span className="ml-2 text-sm font-normal">天</span></p></div><p className="mt-2 text-xs leading-5 text-slate-400">{item.targetYear} 年{item.exam} · {item.date}<br />{item.estimated ? (item.exam === '中考' ? '预计日期，可按地区修改' : '预计日期，待官方安排确认') : '使用设置日期'}</p></div>)}</div>
    </section>;
}
