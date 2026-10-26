import type { CatalogDraft } from './catalog-draft';

export const shanghaiEnglishFiveFourReferenceUrl = 'https://jx.panqjy.cn/album-155148.html';

const upperTitles = [
    'Unit 1 Clubs in our school',
    'Unit 2 Traditional games',
    'Unit 3 Amazing plants',
    'Unit 4 Together with animals',
    'Unit 5 Seeing a doctor',
    'Unit 6 Try my best',
    'Unit 7 Great scientists',
    'Unit 8 Useful inventions',
    'Unit 9 Using computers',
    'Unit 10 A greener life',
];

// A public teaching-resource catalog is useful as a review candidate, but does not
// establish that every unit matches the user's exact ISBN and printing.
export function referenceCatalogFor(scope: {
    region: string; publisher: string; subject: string; grade: string;
    schoolSystem: string; edition: string; isbn: string; volume: string;
}): CatalogDraft | null {
    const isbn = scope.isbn.split('/')[0].replace(/[^0-9X]/gi, '').toUpperCase();
    if (scope.region !== '上海' || scope.publisher !== '上海教育出版社' ||
        scope.subject !== '英语' || scope.grade !== '小学五年级' ||
        scope.schoolSystem !== '五四学制' || scope.volume !== '上册' ||
        isbn !== '9787572043550') return null;
    return { units: upperTitles.map(title => ({ title, lessons: [{ title, page: '' }], entries: [] })) };
}
