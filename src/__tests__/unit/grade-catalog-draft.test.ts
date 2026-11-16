import { describe, expect, it } from 'vitest';
import { parseGradeCatalogDraft } from '@/lib/grade-catalog-draft';

describe('grade catalog draft', () => {
    const unit = { title: '第一单元', lessons: [{ title: '第一课', page: '' }], entries: [{ kind: '知识点', term: '重点', meaning: '说明' }] };
    it('修复目录 JSON 语法后仍校验册别', () => {
        expect(parseGradeCatalogDraft('{"volumes":[{"volume":"上册","units":[{"title":"第一单元","lessons":[{"title":"第一课",}],}],}]}').volumes[0].volume).toBe('上册');
        expect(() => parseGradeCatalogDraft('{"volumes":[{"volume":"全册","units":[],}]}')).toThrow();
    });
    it('requires distinct upper and lower volumes', () => {
        const result = parseGradeCatalogDraft(JSON.stringify({ volumes: [{ volume: '上册', units: [unit] }, { volume: '下册', units: [unit] }] }));
        expect(result.volumes.map(item => item.volume)).toEqual(['上册', '下册']);
        expect(() => parseGradeCatalogDraft(JSON.stringify({ volumes: [{ volume: '上册', units: [unit] }, { volume: '上册', units: [unit] }] }))).toThrow();
    });
});
