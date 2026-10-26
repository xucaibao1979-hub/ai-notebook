import { z } from 'zod';
import { catalogDraftSchema } from './catalog-draft';

export const gradeCatalogDraftSchema = z.object({ volumes: z.array(z.object({ volume: z.enum(['上册', '下册']), units: catalogDraftSchema.shape.units })).min(1).max(2) }).refine(value => new Set(value.volumes.map(item => item.volume)).size === value.volumes.length, '册别不能重复');

export function parseGradeCatalogDraft(answer: string) {
    const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('模型未返回可用的目录 JSON');
    return gradeCatalogDraftSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}
