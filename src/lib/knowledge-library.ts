export const EXAM_SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '理综', '文综', '科学', '其他'] as const;
export const RECENT_EXAM_YEARS = [2026, 2025, 2024, 2023, 2022];
export const GRADE_LABELS: Record<number, string> = { 7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三' };

export interface LibraryQuestion {
    number: string;
    sourceNumber?: string;
    questionHtml: string;
    answerHtml: string;
    grade: number | null;
    gradeBasis: string;
    knowledgePoints: string[];
    answerLeakRisk?: boolean;
    wholePaper?: boolean;
    correctedMarkdown?: string;
    correctedAnswerMarkdown?: string;
    gradeVerified?:boolean;
    originalQuestionHtml?: string;
    locallyReviewed?: boolean;
    reviewedAt?: string;
    reviewedBy?: string;
    hasAnswer?: boolean;
}
export interface LibraryPaper {
    id: string; title: string; year: number; examType: string; subject: string; region: string;
    examGrade: number; questionCount: number; answerCount: number; sourceName: string; sourceUrl: string;
    qualityNote: string; status: string; knowledgeGrades: number[]; fetchedAt: string;
    questions?: LibraryQuestion[]; attachments?: { label: string; url: string; kind: 'paper' | 'answer' }[];
    imagePageCount?:number;
    answerPageCount?:number;
    alternatives?: {id:string;title:string;sourceName:string;status:string}[];
    quality?: { issues: number; locallyReviewed: number; total: number };
}

const MATH_GRADE_RULES: { pattern: RegExp; grade: number; topic: string }[] = [
    { pattern: /二次函数|相似三角形|一元二次方程|反比例函数|圆周角|圆心角|正弦|余弦|锐角三角/, grade: 9, topic: '九年级数学' },
    { pattern: /勾股定理|一次函数|平行四边形|分式方程|二次根式|全等三角形/, grade: 8, topic: '八年级数学' },
    { pattern: /一元一次方程|有理数|无理数|同类项|整式|绝对值|不等式组/, grade: 7, topic: '七年级数学' },
    { pattern: /导数|积分|空间向量|离散型随机|条件概率/, grade: 11, topic: '高中进阶数学' },
    { pattern: /对数|指数函数|集合|三角函数|函数的定义域/, grade: 10, topic: '高中数学基础' },
];

export function inferKnowledgeGrade(text: string, subject: string, examGrade: number) {
    if (subject !== '数学') return { grade: null, gradeBasis: '来源未标注，待人工确认', knowledgePoints: [] as string[] };
    const hits = MATH_GRADE_RULES.filter(rule => rule.pattern.test(text) && (examGrade <= 9 ? rule.grade <= 9 : rule.grade >= 10));
    if (!hits.length) return { grade: null, gradeBasis: '来源未标注，待人工确认', knowledgePoints: [] as string[] };
    return { grade: Math.max(...hits.map(hit => hit.grade)), gradeBasis: '按题干知识关键词推断，教材版本可能不同，待人工确认', knowledgePoints: [...new Set(hits.map(hit => hit.topic))] };
}

export function inferPaperMetadata(title: string) {
    const year = Number(title.match(/((?:19|20)\d{2})/i)?.[1]);
    const examType = /中考/.test(title) ? 'zhongkao' : /高考/.test(title) ? 'gaokao' : '';
    const subject = /道德与法治|道法/.test(title) ? '政治' : EXAM_SUBJECTS.find(subject => title.includes(subject)) || '其他';
    const region = title.replace(/(?:19|20)\d{2}年?/g, '').replace(/七年级|八年级|九年级|初一|初二|初三|高一|高二|高三/g, '').replace(/中考|高考|真题|试卷|试题|答案|解析|原卷版|参考|及|与|卷/g, '').replace(subject, '').replace(/道德与法治|道法/g, '').replace(/[（()）\s·：:]/g, '').trim() || '未标注地区';
    const explicitGrade = /七年级|初一/.test(title) ? 7 : /八年级|初二/.test(title) ? 8 : /九年级|初三/.test(title) ? 9 : /高一/.test(title) ? 10 : /高二/.test(title) ? 11 : /高三/.test(title) ? 12 : null;
    return { year, examType, subject, region, examGrade: explicitGrade || (examType === 'zhongkao' ? 9 : 12) };
}
