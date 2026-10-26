"use client";

import { useState } from 'react';
import { Suspense } from 'react';
import TagsPage from '../../tags/page';
import { KnowledgeNavigation } from '@/components/knowledge-navigation';
import { KnowledgeCards } from '@/components/knowledge-cards';

export default function KnowledgeTagsPage() {
    const [tab, setTab] = useState<'mine' | 'directory'>('mine');
    return <main><div className="mx-auto max-w-6xl px-5 pt-8 md:px-8"><KnowledgeNavigation /><div className="mt-6 flex gap-2" role="tablist" aria-label="知识点分类"><button role="tab" aria-selected={tab === 'mine'} onClick={() => setTab('mine')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'mine' ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-slate-500'}`}>我的知识点</button><button role="tab" aria-selected={tab === 'directory'} onClick={() => setTab('directory')} className={`rounded-lg px-4 py-2 text-sm ${tab === 'directory' ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-slate-500'}`}>知识目录</button></div></div>{tab === 'mine' ? <Suspense fallback={<p className="p-8 text-sm text-slate-500">正在加载知识点…</p>}><KnowledgeCards /></Suspense> : <TagsPage embedded />}</main>;
}
