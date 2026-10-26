"use client";

import { useEffect, useState } from 'react';
import { apiClient, friendlyApiError } from '@/lib/api-client';
import { StudyPreferences, StudyUnit } from '@/lib/study-preferences';
import { STUDENT_GRADES } from '@/lib/student-grade';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

type Response = { units: StudyUnit[]; grade: string };
type Textbook = StudyPreferences['subjectTextbooks'][number];

export function StudyUnitSettings({ subjects, textbooks, defaultGrade }: { subjects: string[]; textbooks: Textbook[]; defaultGrade: string }) {
    const [data, setData] = useState<Response>({ units: [], grade: '' });
    const [subject, setSubject] = useState('');
    const [grade, setGrade] = useState('');
    const [publisher, setPublisher] = useState('');
    const [textbook, setTextbook] = useState('');
    const [volume, setVolume] = useState<StudyUnit['volume']>('');
    const [editingId, setEditingId] = useState('');
    const [title, setTitle] = useState('');
    const [lines, setLines] = useState('');
    const [open, setOpen] = useState(false);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    async function refresh() { setData(await apiClient.get<Response>('/api/study-units')); }
    useEffect(() => { refresh().catch(e => setMessage(friendlyApiError(e))); }, []);
    useEffect(() => { if (!grade && defaultGrade && Object.values(STUDENT_GRADES).includes(defaultGrade)) setGrade(defaultGrade); }, [defaultGrade, grade]);
    useEffect(() => { if (!subject && subjects.length) setSubject(subjects[0]); }, [subject, subjects]);
    const book = textbooks.find(item => item.subject === subject);
    const entries = data.units.filter(item => item.subject === subject && item.grade === grade);
    function reset() { setEditingId(''); setTitle(''); setLines(''); setOpen(false); }
    function startAdd() { reset(); setCatalogOpen(true); setPublisher(book?.publisher || ''); setTextbook(book?.textbook || ''); setVolume('上册'); setOpen(true); }
    function edit(unit: StudyUnit) { setSubject(unit.subject); setGrade(unit.grade); setPublisher(unit.publisher); setTextbook(unit.textbook); setVolume(unit.volume); setEditingId(unit.id); setTitle(unit.title); setLines(unit.entries.map(item => `${item.kind}｜${item.term}｜${item.meaning}`).join('\n')); setOpen(true); }
    async function save() {
        const previous = data.units.find(item => item.id === editingId);
        const kinds = ['单词', '短语', '句子', '知识点'] as const;
        const items = lines.split(/\r?\n/).map(line => line.split(/[|｜\t]/).map(part => part.trim())).map(parts => {
            const explicit = kinds.find(kind => kind === parts[0]);
            const term = explicit ? parts[1] : parts[0];
            const meaning = (explicit ? parts.slice(2) : parts.slice(1)).join('；');
            const inferred = subject === '英语' ? /\s|[.!?]/.test(term || '') ? /[.!?]$/.test(term || '') ? '句子' : '短语' : '单词' : '知识点';
            return { kind: explicit || inferred, term, meaning, mastered: previous?.entries.find(entry => entry.term === term)?.mastered || false };
        }).filter(item => item.term && item.meaning);
        if (!subject || !grade || !title.trim() || !items.length) { setMessage('请选择科目、年级，并填写单元名称与至少一条内容。'); return; }
        setBusy(true); setMessage('');
        try {
            const payload = { subject, grade, publisher: publisher.trim(), textbook: textbook.trim(), volume, title: title.trim(), lessons: previous?.lessons || [], entries: items };
            if (editingId) await apiClient.put('/api/study-units', { ...payload, id: editingId });
            else await apiClient.post('/api/study-units', payload);
            await refresh(); window.dispatchEvent(new Event('study-units-updated')); reset(); setMessage('单元已保存，AI 练习和复习将使用本年级的单元内容。');
        } catch (e) { setMessage(friendlyApiError(e)); } finally { setBusy(false); }
    }
    async function remove(unit: StudyUnit) {
        if (!window.confirm(`移除「${unit.title}」及学习进度？已生成的练习历史会保留。`)) return;
        setBusy(true);
        try { await apiClient.delete(`/api/study-units?id=${encodeURIComponent(unit.id)}`); await refresh(); window.dispatchEvent(new Event('study-units-updated')); if (editingId === unit.id) reset(); setMessage('单元已移除。'); }
        catch (e) { setMessage(friendlyApiError(e)); } finally { setBusy(false); }
    }
    return <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">科目与目录单元</h4><p className="text-xs text-slate-500">已录入 {data.units.length} 个单元。按出版社、科目、年级和册别管理教材目录。</p></div><div className="flex gap-2"><Button size="sm" variant="outline" aria-expanded={catalogOpen} onClick={() => setCatalogOpen(value => !value)}>{catalogOpen ? '收起目录' : '查看目录'}</Button><Button size="sm" variant="outline" onClick={startAdd}>添加单元</Button></div></div>
        {catalogOpen && <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">科目<select aria-label="筛选单元科目" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs">年级<select aria-label="筛选单元年级" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={grade} onChange={e => setGrade(e.target.value)}><option value="">请选择年级</option>{Object.values(STUDENT_GRADES).map(item => <option key={item}>{item}</option>)}</select></label></div>
        <p className="text-xs text-slate-500">默认教材：{book?.publisher || '出版社未设置'} · {book?.textbook || '版本未设置'}。新增单元可单独指定出版社和册别。</p>
        {open && <div className="space-y-3 rounded-xl border bg-slate-50 p-3"><div className="grid gap-2 sm:grid-cols-2"><label className="block text-xs">出版社<Input className="mt-1" value={publisher} maxLength={100} onChange={e => setPublisher(e.target.value)} placeholder="例如：人民教育出版社" /></label><label className="block text-xs">教材名称 / 版本<Input className="mt-1" value={textbook} maxLength={100} onChange={e => setTextbook(e.target.value)} placeholder="例如：义务教育教科书" /></label></div><div className="grid gap-2 sm:grid-cols-3"><label className="text-xs">科目<select aria-label="单元科目" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs">年级<select aria-label="单元年级" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={grade} onChange={e => setGrade(e.target.value)}><option value="">请选择年级</option>{Object.values(STUDENT_GRADES).map(item => <option key={item}>{item}</option>)}</select></label><label className="text-xs">册别<select aria-label="单元册别" className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={volume} onChange={e => setVolume(e.target.value as StudyUnit['volume'])}>{['上册', '下册', '全册'].map(item => <option key={item}>{item}</option>)}</select></label></div><label className="block text-xs">目录单元名称<Input className="mt-1" value={title} maxLength={100} onChange={e => setTitle(e.target.value)} placeholder="例如：Unit 1 / 第一单元 小数乘法" /></label><label className="block text-xs">单元内容（每行：类型｜内容｜释义）<Textarea className="mt-1 min-h-32" value={lines} maxLength={30000} onChange={e => setLines(e.target.value)} placeholder={'单词｜useful｜有用的\n短语｜take photos｜拍照\n句子｜A pencil is useful in class.｜铅笔在课堂上很有用。'} /></label><p className="text-xs text-slate-500">类型可选单词、短语、句子、知识点；旧格式“内容｜释义”仍可使用。</p><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={save}>{editingId ? '保存修改' : '保存单元'}</Button><Button size="sm" variant="ghost" onClick={reset}>取消</Button></div></div>}
        <div className="space-y-2">{entries.map(unit => <div key={unit.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><span className="font-medium">{unit.title}</span><p className="text-xs text-slate-500">{unit.entries.length} 条内容 · {[unit.publisher, unit.textbook, unit.volume].filter(Boolean).join(' · ') || '未指定教材'}</p></div><div className="flex gap-3"><button type="button" disabled={busy} className="text-xs text-indigo-600" onClick={() => edit(unit)}>编辑</button><button type="button" disabled={busy} className="text-xs text-red-500" onClick={() => remove(unit)}>移除</button></div></div>)}{!entries.length && <p className="text-xs text-slate-500">该科目和年级还没有录入单元。</p>}</div>
        </div>}
        {message && <p role="status" className="text-xs text-indigo-700">{message}</p>}
    </div>;
}
