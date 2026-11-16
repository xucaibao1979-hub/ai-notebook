// 旧练习和错题不一定保存独立的 options 数组，选项可能直接写在题干中。
export function hasPrintedChoiceOptions(questionText: string, questionHtml?: string | null): boolean {
    const htmlText = (questionHtml || '').replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(?:p|div|li)\s*>/gi, '\n').replace(/<[^>]*>/g, ' ');
    const choices = `${questionText}\n${htmlText}`.match(/(?:^|\s)([A-DＡ-Ｄ])\s*[.．、)）]\s*\S/gm) || [];
    const letters = new Set(choices.map(choice => choice.trim().charAt(0).replace(/[Ａ-Ｄ]/g, letter => String.fromCharCode(letter.charCodeAt(0) - 65248))));
    return letters.has('A') && letters.has('B');
}

type PrintSelectableItem = {
    id: string;
};

export function getSelectedPrintItems<T extends PrintSelectableItem>(
    items: T[],
    selectedIds: Set<string>,
): T[] {
    return items.filter((item) => selectedIds.has(item.id));
}

export function shouldReserveAnswerSpace(showAnswers: boolean, showAnalysis: boolean): boolean {
    return !showAnswers && !showAnalysis;
}

export function getPrintPreviewCountLabel(totalCount: number, selectedCount: number): string {
    return selectedCount === totalCount
        ? String(totalCount)
        : `${selectedCount}/${totalCount}`;
}

export function getPrintPreviewEmptyState(
    totalCount: number,
    selectedCount: number,
): 'noItems' | 'noSelection' | null {
    if (totalCount === 0) return 'noItems';
    if (selectedCount === 0) return 'noSelection';
    return null;
}
