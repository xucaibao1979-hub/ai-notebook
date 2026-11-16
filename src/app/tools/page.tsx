import Link from 'next/link';
import { BookOpen, BookOpenCheck, Calculator, Camera, Check, ClipboardCheck, FilePenLine, Shapes, Languages, MessageCircle, Mic, Mountain, NotebookTabs, PenLine, ScanLine, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tool = { title: string; subtitle: string; icon: LucideIcon; color: string; href?: string };

const sections: { title: string; tools: Tool[] }[] = [
    { title: '作业辅助', tools: [
        { title: 'AI老师', subtitle: '练习题分步提示', icon: MessageCircle, color: 'from-indigo-400 to-violet-500', href: '/ai-practice' },
        { title: '写作构思', subtitle: '提纲与自查清单', icon: PenLine, color: 'from-orange-300 to-rose-400', href: '/tools/writing' },
        { title: '拍照翻译', subtitle: '图片文字中英互译', icon: Languages, color: 'from-emerald-400 to-teal-500', href: '/tools/translation' },
        { title: '单元作文', subtitle: '按单元主题列提纲', icon: FilePenLine, color: 'from-sky-400 to-blue-500', href: '/tools/writing' },
    ] },
    { title: '学习提升', tools: [
        { title: '智能错题本', subtitle: '错题整理与复习', icon: ClipboardCheck, color: 'from-sky-400 to-cyan-500', href: '/notebooks' },
        { title: '诗词山河', subtitle: '诗词阅读与小问答', icon: Mountain, color: 'from-orange-300 to-red-400', href: '/tools/poetry' },
    ] },
    { title: '专项练习', tools: [
        { title: '口算练习', subtitle: '小数与变式分层练', icon: Calculator, color: 'from-emerald-400 to-green-500', href: '/tools/mental-math' },
        { title: '应用算', subtitle: '按小学年级知识点出题', icon: Shapes, color: 'from-amber-400 to-orange-500', href: '/tools/applied-math' },
        { title: '口语练习', subtitle: '听示范并跟读', icon: Mic, color: 'from-indigo-400 to-purple-500', href: '/tools/speaking' },
    ] },
];

function ToolCard({ tool }: { tool: Tool }) {
    const content = <>
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tool.color} text-white shadow-sm sm:size-11`}><tool.icon className="size-5 sm:size-6" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-slate-900 sm:text-lg">{tool.title}</span><span className="mt-1 block text-xs text-slate-500 sm:text-sm">{tool.subtitle}</span></span>
        {!tool.href && <span className="absolute right-3 top-3 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">规划中</span>}
    </>;
    const className = 'relative flex min-h-24 items-center gap-3 rounded-[20px] border border-slate-100 bg-white px-4 py-5 shadow-[0_4px_22px_rgba(30,41,59,0.04)] sm:min-h-28 sm:gap-4 sm:px-5';
    return tool.href
        ? <Link href={tool.href} className={`${className} transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600`}>{content}</Link>
        : <div className={`${className} pr-5 opacity-75`} aria-label={`${tool.title}，规划中`}>{content}</div>;
}

export default function ToolsPage() {
    return <main className="mx-auto max-w-5xl px-5 pb-28 pt-7 sm:px-8 sm:pt-10 md:pb-14">
        <h1 className="mb-7 text-[28px] font-bold tracking-tight text-slate-950 sm:text-4xl">工具</h1>
        <div className="grid grid-cols-2 gap-4" aria-label="常用学习工具">
            <Link href="/capture" className="group relative isolate min-h-44 overflow-hidden rounded-[25px] border border-cyan-200 bg-gradient-to-br from-[#a9eaf6] via-[#c6f3f8] to-[#d3f3fa] p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 sm:min-h-52 sm:p-7">
                <span className="relative z-10 block text-xl font-bold text-slate-900 sm:text-2xl">拍题答疑</span><span className="relative z-10 mt-2 block text-sm text-slate-600">拍照识题解析</span>
                <span className="absolute -bottom-5 -right-4 flex size-28 items-center justify-center rounded-[35px] bg-white/30 text-[#36baf0] transition group-hover:scale-110 sm:size-36"><Camera className="size-16 drop-shadow-md sm:size-20" strokeWidth={1.8} aria-hidden="true" /></span>
            </Link>
            <Link href="/homework" className="group relative isolate min-h-44 overflow-hidden rounded-[25px] border border-emerald-200 bg-gradient-to-br from-[#a6f1d1] via-[#bdf7dc] to-[#d3fbe7] p-5 transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:min-h-52 sm:p-7">
                <span className="relative z-10 block text-xl font-bold text-slate-900 sm:text-2xl">作业批改</span><span className="relative z-10 mt-2 block text-sm text-slate-600">拍照逐题批改</span>
                <span className="absolute -bottom-5 -right-4 flex size-28 items-center justify-center rounded-[35px] bg-white/30 text-[#17c887] transition group-hover:scale-110 sm:size-36"><ScanLine className="size-16 drop-shadow-md sm:size-20" strokeWidth={1.8} aria-hidden="true" /><Check className="absolute size-9 text-white sm:size-11" strokeWidth={3} aria-hidden="true" /></span>
            </Link>
        </div>
        <p className="mt-3 text-xs text-slate-500">拍题识题与作业批改使用现有 AI 能力，需配置模型服务。</p>
        <div className="mt-8 space-y-9 sm:mt-10">{sections.map(section => <section key={section.title} aria-labelledby={`tool-${section.title}`}>
            <h2 id={`tool-${section.title}`} className="mb-5 px-1 text-lg font-semibold text-slate-700 sm:text-xl">{section.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">{section.tools.map(tool => <ToolCard key={tool.title} tool={tool} />)}</div>
        </section>)}</div>
        <p className="mt-8 text-xs leading-6 text-slate-500">拍照翻译需已有视觉模型配置；诗词山河目前是精选诗词文字学习，不提供地图。写作构思为本地提纲辅助，口语练习为浏览器示范跟读，不提供 AI 发音评分；AI老师入口是现有练习中的分步辅导。</p>
        <nav aria-label="工具页移动导航" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.04)] backdrop-blur md:hidden">
            {[
                { label: '学习', href: '/', icon: BookOpen }, { label: '工具', href: '/tools', icon: BookOpenCheck },
                { label: '练习', href: '/ai-practice', icon: Sparkles }, { label: '错题', href: '/notebooks', icon: NotebookTabs },
            ].map(({ label, href, icon: Icon }) => <Link key={label} href={href} aria-current={href === '/tools' ? 'page' : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${href === '/tools' ? 'font-semibold text-slate-950' : 'text-slate-400'}`}><Icon className="size-6" aria-hidden="true" />{label}</Link>)}
        </nav>
    </main>;
}
