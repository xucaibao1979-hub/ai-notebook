export type PrintableQuestion = { id: number; prompt: string; answer: number; solution?: string };
export type PrintEdition = 'student' | 'answer';

export function PracticePrintSheet({ title, subtitle, questions, edition, kind }: {
    title: string; subtitle: string; questions: PrintableQuestion[]; edition: PrintEdition; kind: 'mental' | 'applied';
}) {
    const pageSize = kind === 'mental' ? 24 : 5;
    const pages: PrintableQuestion[][] = [];
    for (let i = 0; i < questions.length; i += pageSize) pages.push(questions.slice(i, i + pageSize));
    return <div className="practice-print-sheet hidden print:block" aria-label={`${title}打印${edition === 'student' ? '学生版' : '答案版'}`}>
        {pages.map((page, pageIndex) => <section key={pageIndex} className="practice-print-page bg-white">
            <header className="border-b-2 border-black pb-3 text-center">
                <h1 className="text-xl font-bold">{title} · {edition === 'student' ? '学生卷' : '答案卷'}</h1>
                <p className="mt-1 text-xs">{subtitle} · 共 {questions.length} 题 · 第 {pageIndex + 1}/{pages.length} 页</p>
                {edition === 'student' && <p className="mt-3 flex justify-between text-xs"><span>姓名：____________</span><span>日期：____________</span><span>用时：____________</span></p>}
            </header>
            <div className={kind === 'mental' ? 'mt-5 grid grid-cols-2 gap-x-8 gap-y-5' : 'mt-5 space-y-5'}>
                {page.map(question => <div key={question.id} className="break-inside-avoid text-sm leading-7">
                    <p><span className="mr-2">{question.id}.</span>{kind === 'mental' && question.prompt.includes('□') ? question.prompt.replace('□', edition === 'answer' ? String(question.answer) : '______') : <>{question.prompt}{kind === 'mental' ? ' = ' : ''}{kind === 'mental' && (edition === 'answer' ? <strong>{question.answer}</strong> : <span>________</span>)}</>}</p>
                    {kind === 'applied' && edition === 'student' && <div className="mt-2 h-16 border-b border-dotted border-slate-500">列式：</div>}
                    {kind === 'applied' && edition === 'answer' && <p className="text-xs text-slate-700">参考列式：{question.solution || '暂无列式'}；结果：{question.answer}（单位请按题意填写）</p>}
                </div>)}
            </div>
            <footer className="mt-auto border-t pt-2 text-center text-xs text-slate-500">拾题 · 专项练习 · 第 {pageIndex + 1} 页</footer>
        </section>)}
    </div>;
}

export function PrintActions({ onPrint, disabled }: { onPrint: (edition: PrintEdition) => void; disabled: boolean }) {
    return <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" disabled={disabled} onClick={() => onPrint('student')} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">打印学生卷 / 保存 PDF</button>
        <button type="button" disabled={disabled} onClick={() => onPrint('answer')} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-medium text-indigo-700 disabled:opacity-50">打印答案卷 / 保存 PDF</button>
    </div>;
}
