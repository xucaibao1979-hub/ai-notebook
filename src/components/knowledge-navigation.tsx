"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
export function KnowledgeNavigation(){const path=usePathname();return <nav aria-label="知识库分类" className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">{[['/knowledge-library','试卷资料'],['/knowledge-library/tags','知识点'],['/knowledge-library/history','历史习题']].map(([href,label])=><Link key={href} href={href} aria-current={path===href?'page':undefined} className={'rounded-lg px-4 py-2 text-sm '+(path===href?'bg-indigo-50 font-medium text-indigo-600':'text-slate-500 hover:bg-white')}>{label}</Link>)}</nav>;}
