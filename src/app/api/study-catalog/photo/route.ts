import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { getAIService } from '@/lib/ai';
import { modelErrorMessage } from '@/lib/ai/error-message';
import { mergeTextbookPhotoPages, parseTextbookPhotoPage } from '@/lib/textbook-photo';

export const maxDuration = 300;
const image = z.string().max(12_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/);
const requestSchema = z.object({ images: z.array(image).min(1).max(4) });
export const catalogPhotoImagesSchema = requestSchema;

export async function recognizeCatalogPhotos(images: string[], userId: string) {
    const ai = getAIService('homework', userId);
    const results = await Promise.allSettled(images.map(async dataUrl => {
        const prompt = `这是一张教材版权页或目录页照片。只转录图片中清楚可见的事实，不要根据常见教材猜测未显示的单元、页码、版次或 ISBN。书名、出版社、年级、上下册、学制、版次和 ISBN 看不清时填空字符串。目录条目逐项按照片顺序记录，每项只需编号、标题、起始页码；版权页没有目录时 items 为 []。只返回 JSON：{"publisher":"","subject":"","grade":"","volume":"","schoolSystem":"","textbook":"","edition":"","isbn":"","items":[{"number":"1","title":"单元标题","page":"1"}]}。volume 只能是上册、下册、全册或空；schoolSystem 只能是五四学制、六三学制或空。`;
        return parseTextbookPhotoPage(await ai.extractTextbookCatalogPage(dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl.match(/^data:([^;]+)/)![1], prompt));
    }));
    const pages = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!pages.length) throw new Error('图片识别没有返回可用的目录，请确认识图模型可用或裁剪后重试');
    const merged = mergeTextbookPhotoPages(pages);
    return { ...merged, recognizedPages: pages.length, totalPages: images.length, failedPages: images.length - pages.length, verification: 'photo-ocr' as const, status: merged.items.length ? 'catalog' as const : 'metadata-only' as const };
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ message: '请先登录' }, { status: 401 });
    const input = requestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return NextResponse.json({ message: '请上传 1—4 张清晰的版权页或目录页图片' }, { status: 400 });
    try {
        return NextResponse.json(await recognizeCatalogPhotos(input.data.images, session.user.id));
    } catch (error) {
        return NextResponse.json({ message: modelErrorMessage(error) }, { status: 502 });
    }
}
