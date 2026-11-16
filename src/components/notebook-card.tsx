"use client";

import { Card } from "@/components/ui/card";
import { ArrowRight, BookOpen, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotebookCardProps {
    id: string;
    name: string;
    errorCount: number;
    pendingCount: number;
    masteredCount: number;
    onClick: () => void;
    onAdd: () => void;
    onRename?: () => void;
    onDelete?: (id: string) => void;
    itemLabel?: string;
}

export function NotebookCard({ id, name, errorCount, pendingCount, masteredCount, onClick, onAdd, onRename, onDelete, itemLabel = "items" }: NotebookCardProps) {
    return (
        <Card className="group relative gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-sm transition-colors hover:border-indigo-300 hover:shadow-md focus-within:border-indigo-300">
            <button type="button" className="w-full p-4 pr-20 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 sm:p-5 sm:pr-20" onClick={errorCount ? onClick : onAdd} aria-label={errorCount ? `打开${name}错题本，待复习${pendingCount}道，已掌握${masteredCount}道` : `为${name}录入第一题`}>
                <span className="flex items-center gap-2 text-base font-semibold text-slate-900"><BookOpen className="size-5 text-indigo-500" /><span className="truncate">{name}</span></span>
                <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600"><span className="rounded-full bg-slate-100 px-2.5 py-1">{errorCount} {itemLabel}</span>{errorCount > 0 && <><span>待复习 <strong className="font-semibold text-amber-700">{pendingCount}</strong></span><span>已掌握 <strong className="font-semibold text-emerald-700">{masteredCount}</strong></span></>}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-700">{errorCount ? '查看错题' : '录入第一题'}<ArrowRight className="size-4" /></span>
            </button>
            <div className="absolute right-3 top-3 flex items-center gap-1">
                {onRename && <Button type="button" variant="ghost" size="icon-sm" className="size-8 text-slate-500 hover:text-indigo-600" aria-label={`修改${name}错题本名称`} title="修改名称" onClick={onRename}><Pencil className="size-4" /></Button>}
                {onDelete && <Button type="button" variant="ghost" size="icon-sm" className="size-8 text-slate-500 hover:text-red-600" aria-label={`删除${name}错题本`} title={errorCount > 0 ? '请先清空错题后删除' : '删除错题本'} onClick={() => onDelete(id)}><Trash2 className="size-4" /></Button>}
            </div>
        </Card>
    );
}
