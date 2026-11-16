import { z } from 'zod';
import { jsonrepair } from 'jsonrepair';

// 仅用于明确要求返回 JSON 的任务；先严格解析，语法错误时才修复，最后由调用方 schema 校验。
export function parseAIJson<T extends z.ZodType>(text: string, schema: T): z.infer<T> {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI_RESPONSE_ERROR: 模型未返回可用的 JSON');
    const candidate = cleaned.slice(start, end + 1);
    let parsed: unknown;
    try {
        parsed = JSON.parse(candidate);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        parsed = JSON.parse(jsonrepair(candidate));
    }
    return schema.parse(parsed);
}

/**
 * Zod schema for validating AI-parsed questions
 * Ensures type safety and business rule compliance
 */
export const GeogebraAnalysisSchema = z.object({
    suitable: z.boolean(),
    commands: z.array(z.string()),
    description: z.string(),
});

export const ParsedQuestionSchema = z.object({
    questionText: z.string().min(1, "题目文本不能为空"),
    answerText: z.string().min(1, "答案不能为空"),
    analysis: z.string().min(1, "解析不能为空"),
    wrongAnswerText: z.string().optional().default(""),
    mistakeAnalysis: z.string().optional().default(""),
    mistakeStatus: z.enum(["not_attempted", "wrong_attempt", "unknown"]).optional().default("unknown"),
    subject: z.enum([
        "数学", "物理", "化学", "生物",
        "英语", "语文", "历史", "地理",
        "政治", "其他"
    ]),
    knowledgePoints: z.array(z.string()).max(5, "知识点最多 5 个"),
    requiresImage: z.boolean().optional().default(false), // 题目是否依赖图片（如几何题）
});

/**
 * Type inference from Zod schema
 * Use this type instead of manually defining ParsedQuestion
 */
export type ParsedQuestionFromSchema = z.infer<typeof ParsedQuestionSchema>;

/**
 * Validates and parses AI response JSON
 * @param data - Raw JSON data from AI
 * @returns Validated ParsedQuestion object
 * @throws ZodError if validation fails
 */
export function validateParsedQuestion(data: unknown): ParsedQuestionFromSchema {
    return ParsedQuestionSchema.parse(data);
}

/**
 * Safe validation that returns success/error object
 * @param data - Raw JSON data from AI
 */
export function safeParseParsedQuestion(data: unknown) {
    return ParsedQuestionSchema.safeParse(data);
}
