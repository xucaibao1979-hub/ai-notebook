import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import PrintPreviewPage from '@/app/print-preview/page';
import PrintStudyPage from '@/app/print-study/page';
import { apiClient } from '@/lib/api-client';

vi.mock('next/navigation', () => { const params = new URLSearchParams(); return { useSearchParams: () => params }; });
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn() }, friendlyApiError: () => '加载失败' }));
vi.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: { common: { loading: '加载中' } } }) }));
vi.mock('@/components/ui/back-button', () => ({ BackButton: () => null }));
vi.mock('@/components/markdown-renderer', () => ({ MarkdownRenderer: ({ content }: { content: string }) => createElement('span', null, content) }));
import {
    hasPrintedChoiceOptions,
    getPrintPreviewCountLabel,
    getPrintPreviewEmptyState,
    getSelectedPrintItems,
    shouldReserveAnswerSpace,
} from '@/lib/print-preview';

describe('print preview helpers', () => {
    const items = [
        { id: 'item-1', questionText: '题目 1' },
        { id: 'item-2', questionText: '题目 2' },
        { id: 'item-3', questionText: '题目 3' },
    ];

    it('只返回当前选中的题目，并保持原顺序', () => {
        const selected = getSelectedPrintItems(items, new Set(['item-3', 'item-1']));

        expect(selected.map((item) => item.id)).toEqual(['item-1', 'item-3']);
    });

    it('只有在答案和解析都不显示时才预留作答空间', () => {
        expect(shouldReserveAnswerSpace(false, false)).toBe(true);
        expect(shouldReserveAnswerSpace(true, false)).toBe(false);
        expect(shouldReserveAnswerSpace(false, true)).toBe(false);
        expect(shouldReserveAnswerSpace(true, true)).toBe(false);
    });

    it('识别旧题干内直接写出的选择题选项，不误判非选择题的步骤编号', () => {
        expect(hasPrintedChoiceOptions('计算 4.08 × 0.35，下面说法正确的是（  ）。\nA. 错误说法\nB. 正确说法\nC. 另一个说法\nD. 其他说法')).toBe(true);
        expect(hasPrintedChoiceOptions('下列说法正确的是（  ）', '<p>A．第一个选项</p><p>B．第二个选项</p>')).toBe(true);
        expect(hasPrintedChoiceOptions('请列式解答：甲得到 A 元，乙得到 B 元。')).toBe(false);
        expect(hasPrintedChoiceOptions('解题步骤：A. 列式计算，然后检验')).toBe(false);
    });

    it('局部选择时显示已选数量和总数量', () => {
        expect(getPrintPreviewCountLabel(88, 88)).toBe('88');
        expect(getPrintPreviewCountLabel(88, 2)).toBe('2/88');
    });

    it('区分无匹配题目和有题但未选择', () => {
        expect(getPrintPreviewEmptyState(0, 0)).toBe('noItems');
        expect(getPrintPreviewEmptyState(88, 0)).toBe('noSelection');
        expect(getPrintPreviewEmptyState(88, 2)).toBeNull();
    });
});

describe('旧打印预览的学生卷', () => {
    const item = (id: string, questionText: string | null) => ({
        id, questionText, originalImageUrl: `/answered-${id}.jpg`, answerText: '参考答案',
        analysis: '解析', userId: 'user', masteryLevel: 0, createdAt: '', updatedAt: '',
    });

    async function renderPreview(rows: ReturnType<typeof item>[]) {
        vi.mocked(apiClient.get).mockResolvedValue({ items: rows });
        const container = document.createElement('div');
        const root = createRoot(container);
        const previous = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        await act(async () => { root.render(createElement(PrintPreviewPage)); });
        return {
            container,
            async click(button: HTMLButtonElement) { await act(async () => { button.click(); }); },
            async changeCheckbox(label: string) {
                const input = Array.from(container.querySelectorAll('label')).find(node => node.textContent?.includes(label))?.querySelector('input');
                expect(input).toBeTruthy();
                await act(async () => { input?.click(); });
            },
            async cleanup() {
                await act(async () => { root.unmount(); });
                (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
            },
        };
    }

    it('默认学生卷只显示可独立作答的文字，不打印已有作答照片', async () => {
        const page = await renderPreview([item('text', '独立题干')]);
        try {
            expect(page.container.textContent).toContain('独立题干');
            expect(page.container.querySelector('img')).toBeNull();
            expect(page.container.querySelector('button[class*="whitespace-nowrap"]')?.hasAttribute('disabled')).toBe(false);
            const print = vi.spyOn(window, 'print').mockImplementation(() => {});
            await page.click(page.container.querySelector('button[class*="whitespace-nowrap"]')!);
            expect(print).toHaveBeenCalledOnce();
            await page.changeCheckbox('Question Text');
            expect(page.container.querySelector('img')).toBeNull();
        } finally { await page.cleanup(); }
    });

    it('纯照片题阻止学生卷打印并给出问题提示，取消选择后可打印', async () => {
        const page = await renderPreview([item('text', '独立题干'), item('photo', '  ')]);
        try {
            const printButton = page.container.querySelector<HTMLButtonElement>('button[class*="whitespace-nowrap"]')!;
            expect(printButton.disabled).toBe(true);
            expect(page.container.querySelector('[role="alert"]')?.textContent).toContain('没有文字题干');
            expect(page.container.querySelector('[role="alert"]')?.textContent).toContain('2');
            expect(page.container.querySelector('img')).toBeNull();
            expect(page.container.querySelector('.print\\:hidden')).not.toBeNull();
            const photoCheckbox = Array.from(page.container.querySelectorAll('label')).find(node => node.textContent?.includes('Question 2'))!.querySelector('input')!;
            await act(async () => { photoCheckbox.click(); });
            expect(printButton.disabled).toBe(false);
            expect(page.container.querySelector('[role="alert"]')).toBeNull();
        } finally { await page.cleanup(); }
    });

    it('重做卷学生版选择题不预留大块空白，非选择题仍保留作答区', async () => {
        vi.mocked(apiClient.get).mockResolvedValue([
            { key: 'choice', title: '今日练习', questionText: '计算结果正确的是（  ）\nA. 选项一\nB. 选项二', analysis: '', tags: [] },
            { key: 'written', title: '今日练习', questionText: '请列式计算', analysis: '', tags: [] },
        ]);
        const container = document.createElement('div');
        const root = createRoot(container);
        const previous = (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        try {
            await act(async () => { root.render(createElement(PrintStudyPage)); });
            const articles = container.querySelectorAll('article');
            expect(articles).toHaveLength(2);
            expect(articles[0].textContent).toContain('计算结果正确的是');
            expect(articles[0].querySelector('[aria-label*="作答区"]')).toBeNull();
            expect(articles[1].querySelector('[aria-label="第 2 题作答区"]')).not.toBeNull();
            expect(articles[1].querySelector('[aria-label="第 2 题作答区"]')?.classList.contains('min-h-20')).toBe(true);
            expect(articles[1].querySelector('[aria-label="第 2 题作答区"]')?.classList.contains('min-h-40')).toBe(false);
        } finally {
            await act(async () => { root.unmount(); });
            (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = previous;
        }
    });

    it('答案版保留原照片、答案和解析的现有选项', async () => {
        const page = await renderPreview([item('photo', null)]);
        try {
            await page.changeCheckbox('Show Answers');
            expect(page.container.querySelector('img')?.getAttribute('src')).toBe('/answered-photo.jpg');
            expect(page.container.querySelector('[role="alert"]')).toBeNull();
            expect(page.container.querySelector<HTMLButtonElement>('button[class*="whitespace-nowrap"]')?.disabled).toBe(false);
            expect(page.container.textContent).toContain('参考答案');
            await page.changeCheckbox('Question Text');
            expect(page.container.querySelector('img')?.getAttribute('src')).toBe('/answered-photo.jpg');
            await page.changeCheckbox('Show Analysis');
            expect(page.container.textContent).toContain('解析');
        } finally { await page.cleanup(); }
    });
});
