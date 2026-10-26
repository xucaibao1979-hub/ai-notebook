import { describe, expect, it } from 'vitest';
import { referenceCatalogFor } from '@/lib/reference-textbook-catalog';

const scope = {
    region: '上海', publisher: '上海教育出版社', subject: '英语', grade: '小学五年级',
    schoolSystem: '五四学制', edition: '2026年7月第1版', isbn: '978-7-5720-4355-0/G:3916', volume: '上册',
};

describe('English catalog review candidate', () => {
    it('matches a photographed ISBN containing a classification suffix and includes learning goals', () => {
        const draft = referenceCatalogFor(scope);
        expect(draft?.units).toHaveLength(10);
        expect(draft?.units[0].title).toBe('Unit 1 Clubs in our school');
        expect(draft?.units.every(unit => unit.entries.length > 0)).toBe(true);
    });
    it('never treats another volume or ISBN as the same photographed book', () => {
        expect(referenceCatalogFor({ ...scope, volume: '下册' })).toBeNull();
        expect(referenceCatalogFor({ ...scope, isbn: '978-7-5720-4337-6' })).toBeNull();
    });
});
