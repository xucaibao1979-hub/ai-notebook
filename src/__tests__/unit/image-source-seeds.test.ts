import { describe, expect, it } from 'vitest';
import { cacheAvailableAnswers, IMAGE_SOURCE_SEEDS } from '../../../scripts/sync-image-sources';

describe('other public paper sources', () => {
    it('has unique, secure source pages with usable metadata across subjects and regions', () => {
        expect(IMAGE_SOURCE_SEEDS.length).toBeGreaterThan(4);
        expect(new Set(IMAGE_SOURCE_SEEDS.map(seed => seed.url)).size).toBe(IMAGE_SOURCE_SEEDS.length);
        expect(new Set(IMAGE_SOURCE_SEEDS.map(seed => seed.subject)).size).toBeGreaterThan(2);
        for (const seed of IMAGE_SOURCE_SEEDS) {
            expect(new URL(seed.url).protocol).toBe('https:');
            expect(seed.title).toContain(seed.subject);
            expect(seed.region).toBeTruthy();
        }
    });
});

it('keeps a usable paper when one optional answer image is missing', async () => {
    const cache = async (url: string) => {
        if (url === 'missing') throw new Error('HTTP 404');
        return `/saved/${url}`;
    };
    await expect(cacheAvailableAnswers(['first', 'missing', 'last', 'first'], cache)).resolves.toEqual({
        saved: ['/saved/first', '/saved/last'], missing: 1,
    });
    await expect(cacheAvailableAnswers(['broken'], async () => { throw new Error('HTTP 403'); })).rejects.toThrow('HTTP 403');
});
