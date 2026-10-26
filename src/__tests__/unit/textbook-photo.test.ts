import { describe, expect, it } from 'vitest';
import { mergeTextbookPhotoPages, parseTextbookPhotoPage } from '@/lib/textbook-photo';

describe('textbook photo recognition data', () => {
    it('combines copyright metadata and two directory pages without duplicated overlap', () => {
        const copyright = parseTextbookPhotoPage(JSON.stringify({ publisher: '上海教育出版社', subject: '数学', grade: '五年级', volume: '上册', schoolSystem: '五四学制', edition: '2026年7月第1版', isbn: '978-7-5720-4337-6', items: [] }));
        const first = parseTextbookPhotoPage(JSON.stringify({ items: [{ number: '1', title: '小数的乘法与除法', page: '1' }, { number: '2', title: '小数的应用', page: '23' }] }));
        const second = parseTextbookPhotoPage(JSON.stringify({ items: [{ number: '2', title: '小数的应用', page: '23' }, { number: '3', title: '平均数', page: '29' }] }));
        const merged = mergeTextbookPhotoPages([copyright, first, second]);
        expect(merged.isbn).toBe('978-7-5720-4337-6');
        expect(merged.items.map(item => item.title)).toEqual(['小数的乘法与除法', '小数的应用', '平均数']);
    });
});
