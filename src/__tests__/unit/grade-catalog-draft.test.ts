import { describe, expect, it } from 'vitest';
import { parseGradeCatalogDraft } from '@/lib/grade-catalog-draft';

describe('grade catalog draft', () => {
    const unit = { title: '第一单元', lessons: [{ title: '第一课', page: '' }], entries: [{ kind: '知识点', term: '重点', meaning: '说明' }] };
    it('requires distinct upper and lower volumes', () => {
        const result = parseGradeCatalogDraft(JSON.stringify({ volumes: [{ volume: '上册', units: [unit] }, { volume: '下册', units: [unit] }] }));
        expect(result.volumes.map(item => item.volume)).toEqual(['上册', '下册']);
        expect(() => parseGradeCatalogDraft(JSON.stringify({ volumes: [{ volume: '上册', units: [unit] }, { volume: '上册', units: [unit] }] }))).toThrow();
    });
});
