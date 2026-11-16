'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ArrowLeft, Languages } from 'lucide-react';

type Direction = 'zh-en' | 'en-zh';
type Translation = { sourceText: string; translatedText: string };
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export default function TranslationPage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [direction, setDirection] = useState<Direction>('zh-en');
    const [result, setResult] = useState<Translation | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!file) { setPreview(null); return; }
        const url = URL.createObjectURL(file);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    function chooseFile(next: File | null) {
        setFile(null);
        setResult(null);
        setError('');
        if (!next) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type)) {
            setError('请选择 JPEG、PNG 或 WebP 图片');
        } else if (next.size > MAX_IMAGE_BYTES || next.size === 0) {
            setError('图片不能超过 4MB，且不能为空');
        } else {
            setFile(next);
        }
    }

    async function translate() {
        if (!file || loading) return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const image = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error('读取图片失败，请重试'));
                reader.readAsDataURL(file);
            });
            const response = await fetch('/api/tools/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image, direction }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || '翻译失败，请重试');
            setResult({ sourceText: data.sourceText, translatedText: data.translatedText });
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '翻译失败，请重试');
        } finally {
            setLoading(false);
        }
    }

    return <main className="mx-auto max-w-3xl space-y-6 px-5 py-8 md:px-9">
        <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-emerald-700"><ArrowLeft className="size-4" />返回工具箱</Link>
        <header className="flex items-center gap-3"><Languages className="size-8 text-emerald-600" aria-hidden="true" /><div><h1 className="text-3xl font-bold">拍照翻译</h1><p className="mt-1 text-sm text-slate-600">上传或拍摄图片，识别文字并中英互译。需要已配置支持识图的 AI 模型。</p></div></header>
        <section className="space-y-5 rounded-2xl border bg-white p-5">
            <label className="block text-sm font-medium">翻译方向<select value={direction} disabled={loading} onChange={event => { setDirection(event.target.value as Direction); setResult(null); }} className="mt-2 block w-full rounded-lg border p-3"><option value="zh-en">中文 → 英文</option><option value="en-zh">英文 → 中文</option></select></label>
            <label className="block text-sm font-medium">选择或拍摄图片（JPEG / PNG / WebP，不超过 4MB）<input type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={event => chooseFile(event.target.files?.[0] || null)} className="mt-2 block w-full rounded-lg border p-3 text-sm" /></label>
            {preview && <div><p className="mb-2 text-sm text-slate-600">图片预览</p><Image src={preview} alt="待翻译图片预览" width={640} height={400} unoptimized className="max-h-80 max-w-full rounded-lg border object-contain" /></div>}
            <button type="button" disabled={!file || loading} onClick={translate} className="rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? '正在识别并翻译…' : '开始翻译'}</button>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </section>
        {result && <section aria-label="翻译结果" className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h2 className="mb-3 font-semibold">识别原文</h2><p className="whitespace-pre-wrap break-words text-slate-700">{result.sourceText || '未识别到清晰文字，请换一张图片重试。'}</p></div><div className="rounded-2xl border bg-emerald-50 p-5"><h2 className="mb-3 font-semibold">译文</h2><p className="whitespace-pre-wrap break-words text-slate-700">{result.translatedText || '无可翻译的文字。'}</p></div></section>}
    </main>;
}
