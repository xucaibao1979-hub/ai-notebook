"use client";

import { HomeworkQuestion } from '@/lib/homework';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { ArchivedHomeworkImage } from './archived-homework-image';

type ArchiveReview = { id: string; createdAt: string; hasImage?: boolean; questions: HomeworkQuestion[]; scanQuestions?: HomeworkQuestion[] };

export function HomeworkArchiveDialog({ review, onClose }: { review: ArchiveReview; onClose: () => void }) {
    const questions = review.scanQuestions || review.questions;
    return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-2 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section role="dialog" aria-modal="true" aria-label="作业批改留档" className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <header className="flex shrink-0 items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">作业批改留档</h2><p className="text-xs text-slate-500">{new Date(review.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · {questions.length} 题</p></div><button type="button" aria-label="关闭批改留档" onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1.5 text-xl">×</button></header>
            <div className="space-y-5 overflow-y-auto p-4">
                <ArchivedHomeworkImage reviewId={review.id} hasImage={review.hasImage} mode="detail" />
                <div className="space-y-3">{questions.map((question, index) => <article key={`${question.number}-${index}`} className="rounded-lg border p-4"><div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium"><span>第 {question.number} 题 · {question.subject}</span><span className={question.judgement === 'correct' ? 'text-emerald-700' : question.judgement === 'wrong' ? 'text-red-600' : 'text-amber-700'}>{question.judgement === 'correct' ? '正确' : question.judgement === 'wrong' ? '错误' : question.judgement === 'unanswered' ? '未作答' : '待确认'}</span></div><MarkdownRenderer content={question.questionText} /><p className="mt-2 text-sm text-slate-600">学生作答：{question.studentAnswer || '未识别到'}</p><details className="mt-2 text-sm"><summary className="cursor-pointer text-indigo-600">查看答案和解析</summary><div className="mt-2 space-y-2"><MarkdownRenderer content={question.answerText} /><MarkdownRenderer content={question.analysis} /></div></details></article>)}{questions.length === 0 && <p className="text-sm text-slate-500">此记录没有可查看的逐题结果。</p>}</div>
            </div>
        </section>
    </div>;
}
