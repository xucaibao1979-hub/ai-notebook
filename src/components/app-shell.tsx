"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { Sparkles, GraduationCap, Menu, X, LogOut, Library, BookOpen, NotebookTabs, ScanLine, Settings, User, Bot, Shield, Info } from 'lucide-react';
import { LearnerSwitcher } from '@/components/learner-switcher';
import { SettingsDialog } from '@/components/settings-dialog';
import Image from 'next/image';

const navigation = [
    { href:'/homework',label:'AI批改',icon:ScanLine },
    { href: '/notebooks', label: '错题本', icon: NotebookTabs },
    { href: '/ai-practice', label: 'AI练习', icon: Sparkles },
    { href: '/knowledge-library', label: '知识库', icon: Library },
    { href: '/daily', label: '每日推荐', icon: GraduationCap },
];

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [mobileOpen, setMobileOpen] = useState(false);
    if (['/login', '/register', '/print-preview', '/latex-test'].some(path => pathname.startsWith(path))) return children;
    const links = navigation;
    return <div className="min-h-screen bg-[#f7f8fc]">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-5 py-3 md:hidden print:hidden">
            <Link href="/" className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#4563ee] text-white"><BookOpen className="size-6" aria-hidden="true" /></span><span><span className="block text-2xl font-bold leading-7 tracking-tight text-slate-800">拾题</span><span className="block text-xs text-slate-400">AI 错题本</span></span></Link>
            <button aria-label="打开导航菜单" onClick={() => setMobileOpen(true)} className="rounded-lg p-2 hover:bg-slate-100"><Menu className="size-5" /></button>
        </header>
        {mobileOpen && <button aria-label="关闭导航菜单" className="fixed inset-0 z-40 bg-slate-900/30 md:hidden" onClick={() => setMobileOpen(false)} />}
        <aside className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-slate-200/70 bg-white transition-transform md:translate-x-0 print:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="flex items-center gap-3 px-8 pb-8 pt-10">
                
                <Link href="/" onClick={() => setMobileOpen(false)} className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#4563ee] text-white"><BookOpen className="size-6" aria-hidden="true" /></span><span><span className="block text-2xl font-bold leading-7 tracking-tight text-slate-800">拾题</span><span className="block text-xs text-slate-400">AI 错题本</span></span></Link>
                <button className="ml-auto md:hidden" aria-label="收起导航" onClick={() => setMobileOpen(false)}><X className="size-4" /></button>
            </div>
            <div className="px-5 pb-4"><LearnerSwitcher /></div>
            <p className="px-8 pb-4 text-xs text-slate-400">我的学习空间</p>
            <nav aria-label="主导航" className="flex-1 space-y-2 overflow-y-auto px-5">
                {links.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href) || (href === '/ai-practice' && pathname === '/practice') || (href === '/knowledge-library' && pathname === '/tags') || (href === '/notebooks' && pathname === '/capture');
                    return <Link key={href} href={href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={`flex h-12 items-center gap-3 rounded-xl px-4 text-sm transition-colors ${active ? 'bg-indigo-50 font-semibold text-indigo-500' : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-500'}`}><Icon className="size-5 shrink-0" />{label}</Link>;
                })}
            </nav>
            <div className="m-5 border-t border-slate-100 pt-4">
                <div className="group flex items-center gap-3 px-2">
                    <div className="relative">
                        <button aria-label="账户与设置" title="账户与设置：修改年级、考试日期和模型服务" className="flex size-9 items-center justify-center rounded-full bg-indigo-50 ring-indigo-200 focus:ring-2" onClick={() => window.dispatchEvent(new CustomEvent('open-app-settings', { detail: { tab: 'general' } }))}><Image src="/icons/panda-logo.png" alt="账户与设置" width={32} height={32} className="size-8 object-contain" /></button>
                        <div className="absolute bottom-full left-0 z-50 hidden w-52 pb-3 group-hover:block group-focus-within:block"><div className="rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><button onClick={() => window.dispatchEvent(new CustomEvent('open-app-settings', { detail: { tab: 'account' } }))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"><Settings className="size-4" />设置</button><button onClick={() => signOut({ callbackUrl: '/login' })} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-3 py-2.5 text-left text-xs text-red-500 hover:bg-red-50"><LogOut className="size-4" />退出登录</button></div></div>
                    </div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-700">{session?.user?.username || session?.user?.name || '我的账号'}</p><p className="text-[11px] text-slate-400">每天进步一点点</p></div>
                </div>
                <SettingsDialog hideTrigger />
            </div>
        </aside>
        <div className="min-w-0 md:ml-56 print:ml-0">{children}</div>
    </div>;
}
