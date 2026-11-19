"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { ArrowRight, BookOpenCheck, Globe2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { NotebookCard } from "@/components/notebook-card";
import { CreateNotebookDialog } from "@/components/create-notebook-dialog";
import { RenameNotebookDialog } from "@/components/rename-notebook-dialog";

import { Input } from "@/components/ui/input";
import { Notebook } from "@/types/api";
import { apiClient } from "@/lib/api-client";

import { useLanguage } from "@/contexts/LanguageContext";
import { NotebookSearchResults } from '@/components/notebook-search-results';
import { WeeklyReview } from '@/components/weekly-review';

// ... imports

export default function NotebooksPage() {
    const router = useRouter();
    const { t } = useLanguage(); // Use hook
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [search, setSearch] = useState('');
    const filteredNotebooks = notebooks.filter(notebook => notebook.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const totalErrors = notebooks.reduce((sum, notebook) => sum + (notebook._count?.errorItems || 0), 0);
    const nextNotebook = [...notebooks].sort((a, b) => (b.progress?.pending || 0) - (a.progress?.pending || 0)).find(notebook => (notebook.progress?.pending || 0) > 0);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Notebook | null>(null);

    useEffect(() => {
        fetchNotebooks();
    }, []);

    const fetchNotebooks = async () => {
        try {
            const data = await apiClient.get<Notebook[]>("/api/notebooks");
            setNotebooks(data);
        } catch (error) {
            console.error("Failed to fetch notebooks:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (name: string) => {
        try {
            await apiClient.post("/api/notebooks", { name });
            await fetchNotebooks();
        } catch (error: any) {
            console.error(error);
            const message = error.data?.message || t.notebooks?.createError || "Failed to create";
            alert(message);
        }
    };

    const handleRename = async (name: string) => {
        if (!renameTarget) return;
        await apiClient.put(`/api/notebooks/${renameTarget.id}`, { name });
        setRenameTarget(null);
        await fetchNotebooks();
    };

    const handleDelete = async (id: string, errorCount: number, name: string) => {
        if (errorCount > 0) {
            alert(t.notebooks?.deleteNotEmpty || "Please clear all items in this notebook first.");
            return;
        }
        if (!confirm((t.notebooks?.deleteConfirm || "Are you sure?").replace("{name}", name))) return;

        try {
            await apiClient.delete(`/api/notebooks/${id}`);
            await fetchNotebooks();
        } catch (error: any) {
            console.error(error);
            const message = error.data?.message || t.notebooks?.deleteError || "Failed to delete";
            alert(message);
        }
    };

    const handleNotebookClick = (id: string) => {
        router.push(`/notebooks/${id}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">{t.common.loading}</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50/70 p-4 md:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-start gap-3 sm:gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{t.notebooks?.title || "My Notebooks"}</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            {t.notebooks?.subtitle || "Manage your mistakes by subject"}
                        </p>
                    </div>
                    <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
                        <Link href="/notebooks/network-bank" className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><Globe2 className="mr-1 size-4" />网络题库 · 查看数量</Link>
                        <Link href="/capture"><Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"><Plus className="mr-1 size-4" />录入错题</Button></Link>
                        <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm" className="hidden sm:flex">
                            <Plus className="mr-2 h-4 w-4" />
                            {t.notebooks?.create || "New Notebook"}
                        </Button>
                        <Button onClick={() => setDialogOpen(true)} variant="outline" size="icon" aria-label="新建错题本" className="sm:hidden">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-white p-5 sm:p-6" aria-label="错题学习概况">
                    <div className="flex items-center gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><BookOpenCheck className="size-5" /></span><div><p className="text-sm font-semibold text-slate-900">继续整理，巩固薄弱点</p><p className="mt-1 text-xs text-slate-500">我的错题本 {notebooks.length} 本 · 可见错题 {totalErrors} 道</p></div></div>
                    {nextNotebook ? <Link href={`/notebooks/${nextNotebook.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">复习{nextNotebook.name} · {nextNotebook.progress?.pending} 道待复习<ArrowRight className="size-4" /></Link> : <Link href="/capture" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">录入第一道错题<ArrowRight className="size-4" /></Link>}
                </section>

                <div className="relative"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input aria-label="搜索错题本" placeholder="搜索科目、题干或知识点…" value={search} onChange={e => setSearch(e.target.value)} className="h-11 rounded-xl border-slate-200 bg-white pl-10" /></div>
                <NotebookSearchResults query={search} />
                {notebooks.length > 0 && !filteredNotebooks.length && <p className="text-sm text-slate-500">没有找到匹配的错题本，请更换关键词。</p>}
                {notebooks.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground mb-4">
                            {t.notebooks?.empty || "No notebooks yet."}
                        </p>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t.notebooks?.createFirst || "Create Notebook"}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="科目错题本">
                        {filteredNotebooks.map((notebook) => (
                            <NotebookCard
                                key={notebook.id}
                                id={notebook.id}
                                name={notebook.name}
                                errorCount={notebook._count?.errorItems || 0}
                                pendingCount={notebook.progress?.pending || 0}
                                masteredCount={notebook.progress?.mastered || 0}
                                onClick={() => handleNotebookClick(notebook.id)}
                                onAdd={() => router.push(`/capture?notebook=${encodeURIComponent(notebook.id)}`)}
                                onRename={() => setRenameTarget(notebook)}
                                onDelete={() => handleDelete(notebook.id, notebook._count?.errorItems || 0, notebook.name)}
                                itemLabel={t.notebooks?.items || "items"}
                            />
                        ))}
                    </div>
                )}

                <WeeklyReview />

                <CreateNotebookDialog
                    key={t.common.loading} // Force re-render when language changes
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    onCreate={handleCreate}
                />

                <RenameNotebookDialog
                    open={!!renameTarget}
                    onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
                    currentName={renameTarget?.name || ""}
                    onRename={handleRename}
                />
            </div >
        </main >
    );
}
