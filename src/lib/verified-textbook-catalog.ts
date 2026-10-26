import type { CatalogDraft } from './catalog-draft';

export const shanghaiMathFiveFour2026 = {
    region: '上海',
    publisher: '上海教育出版社',
    subject: '数学',
    grade: '小学五年级',
    schoolSystem: '五四学制',
    textbook: '义务教育教科书（五·四学制）·数学',
    edition: '2026年7月第1版',
    isbn: '978-7-5720-4337-6',
} as const;

export function matchingVerifiedTextbook(scope: {
    region: string; publisher: string; subject: string; grade: string;
    schoolSystem: string; textbook: string; edition: string; isbn: string;
}) {
    const book = shanghaiMathFiveFour2026;
    const normalizedName = (value: string) => value.replace(/[·•.．\s（）()]/g, '');
    const normalizedIsbn = (value: string) => value.replace(/[^0-9X]/gi, '');
    if (scope.region !== book.region || scope.publisher !== book.publisher ||
        scope.subject !== book.subject || scope.grade !== book.grade ||
        (scope.schoolSystem && scope.schoolSystem !== book.schoolSystem) ||
        (scope.textbook && normalizedName(scope.textbook) !== normalizedName(book.textbook)) ||
        (scope.edition && scope.edition.replace(/\s/g, '') !== book.edition) ||
        (scope.isbn && normalizedIsbn(scope.isbn) !== normalizedIsbn(book.isbn))) return null;
    return book;
}

const upperContents = [
    ['小数的乘法与除法', '1'],
    ['小数的应用', '23'],
    ['平均数', '29'],
    ['制订旅行方案', '38'],
    ['面积的计算', '43'],
    ['课间体育活动', '63'],
    ['因数与倍数', '67'],
    ['数学广场', '98'],
    ['复习', '102'],
] as const;

export function verifiedCatalogFor(scope: {
    region: string; publisher: string; subject: string; grade: string;
    schoolSystem: string; textbook: string; edition: string; isbn: string; volume: string;
}): CatalogDraft | null {
    if (scope.volume !== '上册' || !matchingVerifiedTextbook(scope)) return null;
    return { units: upperContents.map(([title, page]) => ({ title, lessons: [{ title, page }], entries: [] })) };
}
