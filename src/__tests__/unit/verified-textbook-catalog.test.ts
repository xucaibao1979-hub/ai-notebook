import { describe, expect, it } from 'vitest';
import { shanghaiMathFiveFour2026, verifiedCatalogFor } from '@/lib/verified-textbook-catalog';

describe('photo-backed textbook catalog', () => {
    const scope = { ...shanghaiMathFiveFour2026, volume: '上册' };
    it('returns all nine photographed upper-volume contents in order with photographed pages', () => {
        const draft = verifiedCatalogFor(scope);
        expect(draft?.units.map(unit => [unit.title, unit.lessons[0].page])).toEqual([
            ['小数的乘法与除法', '1'], ['小数的应用', '23'], ['平均数', '29'],
            ['制订旅行方案', '38'], ['面积的计算', '43'], ['课间体育活动', '63'],
            ['因数与倍数', '67'], ['数学广场', '98'], ['复习', '102'],
        ]);
        expect(draft?.units.every(unit => unit.entries.length === 0)).toBe(true);
    });
    it('does not reuse the upper volume for another edition, ISBN, or lower volume', () => {
        expect(verifiedCatalogFor({ ...scope, volume: '下册' })).toBeNull();
        expect(verifiedCatalogFor({ ...scope, edition: '2025年7月第1版' })).toBeNull();
        expect(verifiedCatalogFor({ ...scope, isbn: '978-7-5720-4337-5' })).toBeNull();
        expect(verifiedCatalogFor({ ...scope, schoolSystem: '六三学制' })).toBeNull();
    });
});
