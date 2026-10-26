"use client";

import { useState } from 'react';
import { STUDENT_GRADES } from '@/lib/student-grade';

const groups = [
    { title: '小学', grades: [1, 2, 3, 4, 5, 6] },
    { title: '初中', grades: [7, 8, 9] },
    { title: '高中', grades: [10, 11, 12] },
    { title: '大学', grades: [13, 14, 15, 16, 17] },
];

export function GradePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const [open, setOpen] = useState(false);
    const choose = (grade: string) => { onChange(grade); setOpen(false); };
    return <>
        <button id="profile-current-grade" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm">
            <span>{value ? STUDENT_GRADES[Number(value)] : '请选择年级'}</span><span aria-hidden="true">⌄</span>
        </button>
        {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
            <div role="dialog" aria-modal="true" aria-label="请选择年级" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-xl sm:rounded-2xl">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">请选择年级</h2><p className="mt-1 text-sm text-slate-500">用于匹配适合的教材和练习</p></div><button type="button" aria-label="关闭年级选择" onClick={() => setOpen(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xl">×</button></div>
                <div className="mt-6 space-y-6">{groups.map(group => <section key={group.title}><h3 className="mb-3 font-semibold">{group.title}</h3><div className="grid grid-cols-3 gap-2">{group.grades.map(grade => <button key={grade} type="button" aria-pressed={value === String(grade)} onClick={() => choose(String(grade))} className={`rounded-xl border px-2 py-3 text-sm font-medium ${value === String(grade) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:bg-slate-50'}`}>{grade <= 6 ? `${grade === 1 ? '一' : grade === 2 ? '二' : grade === 3 ? '三' : grade === 4 ? '四' : grade === 5 ? '五' : '六'}年级` : STUDENT_GRADES[grade]}</button>)}</div></section>)}</div>
                <button type="button" onClick={() => choose('')} className="mt-6 w-full py-2 text-sm text-slate-500">按学段和入学年份自动推算</button>
            </div>
        </div>}
    </>;
}
