"use client";

import { useEffect, useState } from 'react';

export function ArchivedHomeworkImage({ reviewId, hasImage, mode }: { reviewId: string; hasImage?: boolean; mode: 'thumbnail' | 'detail' }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [reviewId]);
    if (!hasImage || failed) return <div role="status" className={`flex items-center justify-center rounded-lg bg-amber-50 p-3 text-center text-xs text-amber-900 ${mode === 'thumbnail' ? 'h-full w-full' : 'min-h-28 w-full'}`}>{failed ? '原图加载失败；批改文字仍可查看' : '旧记录未保存可用原图；点击查看批改文字'}</div>;
    return <img src={`/api/homework/image?id=${encodeURIComponent(reviewId)}`} alt="批改作业原图" loading="lazy" onError={() => setFailed(true)} className={mode === 'thumbnail' ? 'h-full w-full object-cover' : 'mx-auto max-h-[65vh] max-w-full rounded-lg border object-contain'} />;
}
