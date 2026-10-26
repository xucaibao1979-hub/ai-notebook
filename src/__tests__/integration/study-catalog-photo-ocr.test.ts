import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), extract: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/ai', () => ({ getAIService: () => ({ extractTextbookCatalogPage: mocks.extract }) }));
import { POST } from '@/app/api/study-catalog/photo/route';

describe('textbook photo OCR preview', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue({ user: { id: 'student-a' } }); });
    it('recognizes a copyright page and directory page without saving images', async () => {
        mocks.extract.mockResolvedValueOnce(JSON.stringify({ publisher: '上海教育出版社', isbn: '978-7-5720-4337-6' }))
            .mockResolvedValueOnce(JSON.stringify({ volume: '上册', items: [{ number: '1', title: '小数的乘法与除法', page: '1' }] }));
        const image = 'data:image/jpeg;base64,abcd';
        const response = await POST(new Request('http://localhost/api/study-catalog/photo', { method: 'POST', body: JSON.stringify({ images: [image, image] }) }));
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.isbn).toBe('978-7-5720-4337-6');
        expect(data.items).toEqual([{ number: '1', title: '小数的乘法与除法', page: '1' }]);
        expect(data.images).toBeUndefined();
    });
    it('returns visible partial metadata when only the copyright page is uploaded', async () => {
        mocks.extract.mockResolvedValue(JSON.stringify({ publisher: '上海教育出版社', edition: '2026年7月第1版', items: [] }));
        const response = await POST(new Request('http://localhost/api/study-catalog/photo', { method: 'POST', body: JSON.stringify({ images: ['data:image/jpeg;base64,abcd'] }) }));
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(data.status).toBe('metadata-only');
        expect(data.publisher).toBe('上海教育出版社');
        expect(data.items).toEqual([]);
    });
});
