import { z } from 'zod';
import { parseAIJson } from './ai/schema';

const item = z.object({ number: z.string().trim().max(16).default(''), title: z.string().trim().min(1).max(100), page: z.string().trim().max(20).default('') });
export const textbookPhotoPageSchema = z.object({
    publisher: z.string().trim().max(100).default(''),
    subject: z.string().trim().max(50).default(''),
    grade: z.string().trim().max(80).default(''),
    volume: z.enum(['', '上册', '下册', '全册']).default(''),
    schoolSystem: z.enum(['', '五四学制', '六三学制']).default(''),
    textbook: z.string().trim().max(100).default(''),
    edition: z.string().trim().max(80).default(''),
    isbn: z.string().trim().max(32).default(''),
    items: z.array(item).max(50).default([]),
});
export type TextbookPhotoPage = z.infer<typeof textbookPhotoPageSchema>;

export function parseTextbookPhotoPage(answer: string): TextbookPhotoPage {
    return parseAIJson(answer, textbookPhotoPageSchema);
}

export function mergeTextbookPhotoPages(pages: TextbookPhotoPage[]): TextbookPhotoPage {
    const fields = ['publisher', 'subject', 'grade', 'volume', 'schoolSystem', 'textbook', 'edition', 'isbn'] as const;
    const result = textbookPhotoPageSchema.parse({});
    for (const field of fields) {
        const value = pages.map(page => page[field]).find(Boolean);
        if (value) (result as Record<string, unknown>)[field] = value;
    }
    const seen = new Set<string>();
    result.items = pages.flatMap(page => page.items).filter(row => {
        const key = `${row.number.replace(/\s/g, '')}:${row.title.replace(/\s/g, '')}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
    });
    return result;
}
