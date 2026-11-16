import { z } from 'zod';
import { catalogDraftSchema } from './catalog-draft';
import { parseAIJson } from './ai/schema';

export const gradeCatalogDraftSchema = z.object({ volumes: z.array(z.object({ volume: z.enum(['上册', '下册']), units: catalogDraftSchema.shape.units })).min(1).max(2) }).refine(value => new Set(value.volumes.map(item => item.volume)).size === value.volumes.length, '册别不能重复');

export function parseGradeCatalogDraft(answer: string) {
    return parseAIJson(answer, gradeCatalogDraftSchema);
}
