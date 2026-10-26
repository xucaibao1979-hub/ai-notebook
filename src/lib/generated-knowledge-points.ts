type SavedSet = { id: string; questions: string; parameters: string; deletedIndices: string; createdAt: Date };
export type GeneratedKnowledgePoint = { id: string; subject: string; title: string; grade: string | null; count: number; setId: string; updatedAt: string };

export function knowledgePointKey(subject: string, title: string) {
    const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    return `${normalize(subject)}\u0000${normalize(title)}`;
}

export function generatedKnowledgePoints(sets: SavedSet[], existing: { subject: string; title: string }[] = []): GeneratedKnowledgePoint[] {
    const known = new Set(existing.map(card => knowledgePointKey(card.subject, card.title)));
    const points = new Map<string, GeneratedKnowledgePoint>();
    for (const set of sets) {
        let questions: { subject?: unknown; knowledgePoints?: unknown }[];
        let parameters: { subject?: unknown; grade?: unknown };
        let deleted: number[];
        try {
            questions = JSON.parse(set.questions);
            parameters = JSON.parse(set.parameters || '{}') || {};
            deleted = JSON.parse(set.deletedIndices || '[]');
            if (!Array.isArray(questions) || !Array.isArray(deleted)) continue;
        } catch { continue; }
        for (const [index, question] of questions.entries()) {
            if (deleted.includes(index) || !question || typeof question !== 'object' || !Array.isArray(question.knowledgePoints)) continue;
            const subject = typeof question.subject === 'string' ? question.subject.trim() : typeof parameters.subject === 'string' ? parameters.subject.trim() : '';
            if (!subject) continue;
            const seenInQuestion = new Set<string>();
            for (const raw of question.knowledgePoints) {
                if (typeof raw !== 'string') continue;
                const title = raw.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 100);
                if (!title) continue;
                const key = knowledgePointKey(subject, title);
                if (known.has(key) || seenInQuestion.has(key)) continue;
                seenInQuestion.add(key);
                const previous = points.get(key);
                if (previous) { previous.count++; continue; }
                points.set(key, { id: `generated:${set.id}:${index}:${points.size}`, subject, title, grade: typeof parameters.grade === 'string' ? parameters.grade : null, count: 1, setId: set.id, updatedAt: set.createdAt.toISOString() });
            }
        }
    }
    return [...points.values()];
}
