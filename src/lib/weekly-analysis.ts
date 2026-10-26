export interface WeeklyItem {
    id: string; questionText: string | null; masteryLevel: number; mistakeAnalysis: string | null;
    errorType: string | null; knowledgePoints: string | null; subject: { name: string } | null;
    tags: { name: string }[]; gradeSemester: string | null;
}
export interface WeakPoint {
    name: string; subject: string; count: number; unmastered: number; score: number; errorIds: string[];
}
export interface WeeklyStatistics {
    curriculumKey?:string|null;
    grade?: number | null;
    gradeLabel?: string;
    total: number; mastered: number; unmastered: number; weakPoints: WeakPoint[];
    mistakeTypes: { name: string; count: number }[];
}

export function weeklyWindow(now = new Date()) {
    const shanghai = new Date(now.getTime() + 8 * 3600000);
    const monday = new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return { weekKey: monday.toISOString().slice(0, 10), periodStart: new Date(now.getTime() - 7 * 86400000), periodEnd: now };
}

export function calculateWeakPoints(items: WeeklyItem[]): WeeklyStatistics {
    const points = new Map<string, WeakPoint>();
    const types = new Map<string, number>();
    for (const item of items) {
        const subject = item.subject?.name || '未分类';
        let legacy: string[] = [];
        try { const parsed = JSON.parse(item.knowledgePoints || '[]'); if (Array.isArray(parsed)) legacy = parsed.filter(tag => typeof tag === 'string'); } catch { /* Old malformed tags do not break weekly reports. */ }
        const names = [...new Set(item.tags.length ? item.tags.map(tag => tag.name) : legacy.length ? legacy : [`${subject}综合基础`])];
        for (const name of names) {
            const key = `${subject}:${name}`;
            const point = points.get(key) || { name, subject, count: 0, unmastered: 0, score: 0, errorIds: [] };
            point.count++; point.unmastered += item.masteryLevel < 2 ? 1 : 0;
            point.score += item.masteryLevel === 0 ? 3 : item.masteryLevel === 1 ? 2 : 0.5;
            point.errorIds.push(item.id); points.set(key, point);
        }
        if (item.errorType?.trim()) types.set(item.errorType.trim(), (types.get(item.errorType.trim()) || 0) + 1);
    }
    return { total: items.length, mastered: items.filter(item => item.masteryLevel === 2).length, unmastered: items.filter(item => item.masteryLevel < 2).length,
        weakPoints: [...points.values()].sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 8),
        mistakeTypes: [...types].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
}
