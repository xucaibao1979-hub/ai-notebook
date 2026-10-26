import { z } from 'zod';

export const LEARNING_HISTORY_PAGE_SIZE = 5;
export const LEARNING_SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '其他'] as const;
export const learningRequestSchema = z.object({
    mode: z.enum(['daily', 'ai']),
    source: z.enum(['notebook', 'network', 'ai', 'history']),
    historySetId: z.string().max(100).optional(),
    unitId: z.string().max(100).optional(),
    unitIds: z.array(z.string().max(100)).max(30).optional(),
    paperId: z.string().max(100).optional(),
    paperSets: z.number().int().min(1).max(2).optional(),
    unitMode: z.enum(['practice', 'review']).optional(),
    subject: z.string().trim().min(1).max(50).optional(),
    publisher: z.string().trim().max(100).optional(),
    volume: z.string().trim().max(30).optional(),
    notebookId: z.string().max(100).optional(),
    prompt: z.string().trim().max(2000).default(''),
    knowledgePoint: z.string().trim().max(300).default(''),
    grade: z.string().trim().max(80).default(''),
    difficulty: z.enum(['easy', 'medium', 'hard', 'harder']).default('medium'),
    count: z.number().int().min(1).max(12).default(3),
}).superRefine((value, ctx) => {
    if (value.mode === 'daily' && value.count > 5) ctx.addIssue({ code: 'custom', message: '每日推荐最多生成 5 题', path: ['count'] });
    if (value.mode === 'ai' && (value.source !== 'ai' && value.source !== 'history' || value.source === 'ai' && !value.subject || value.source === 'history' && !value.historySetId)) {
        ctx.addIssue({ code: 'custom', message: '请选择 AI 练习的科目', path: ['subject'] });
    }
    if (value.mode === 'daily' && (value.source === 'ai' || value.source === 'history')) {
        ctx.addIssue({ code: 'custom', message: '请选择错题本或网络来源', path: ['source'] });
    }
    if (value.source === 'network' && value.subject && (!LEARNING_SUBJECTS.includes(value.subject as typeof LEARNING_SUBJECTS[number]) || value.subject === '其他')) {
        ctx.addIssue({ code: 'custom', message: '网络题库支持九门主要学科，请选择具体科目', path: ['subject'] });
    }
});
export type LearningRequest = z.infer<typeof learningRequestSchema>;

export interface LearningExercise {
    referenceSources?: {name:string;url?:string}[];
    feedback?: {date:string;message:string}[];
    validation?: { status: 'ai-reviewed'; note: string };
    recommendationReason?: string;
    favorited?: boolean;
    deleted?: boolean;
    questionText: string;
    questionHtml?: string;
    answerHtml?: string;
    answerText?: string;
    analysis?: string;
    subject: string;
    knowledgePoints: string[];
    options?: string[];
    correctOption?: string;
    difficulty: string;
    provenance: { curriculum?:string; name: string; url?: string; license?: string; licenseUrl?: string; originalId?: string; grade?: string };
    record?: { userAnswer: string; isCorrect: boolean | null };
}

export interface LearningSetResponse {
    warning?: string;
    createdAt?: string;
    favorited?: boolean;
    id: string;
    dateKey: string | null;
    title: string;
    source: string;
    questions: LearningExercise[];
    parameters?: LearningRequest;
}

export function learningDateKey(date = new Date()): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
}

export function shuffleQuestions<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export function buildLearningBrief(request: LearningRequest, topic: string, variation: string): string {
    return `请创作一道完整、可独立作答的${request.subject}练习题。\n这是按学习要求自由出题，不是对这些要求本身作答。\n知识点：${topic || '从该学科的常见知识点中随机选择'}\n学习要求：${request.prompt || '巩固基础并训练容易混淆的概念'}\n年级：${request.grade || '适合中学生'}\n题型或情境变化：${variation}\n题目必须包含解题所需的全部信息。不要要求查看未提供的图、文章或资料。保持题目、答案和解析准确，解析包含易错点提醒。`;
}
