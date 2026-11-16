import { z } from 'zod';
import type { AppliedMathQuestion } from '@/lib/applied-math';
import type { MathQuestion } from '@/lib/mental-math';

export const toolKindSchema = z.enum(['mental-math', 'applied-math']);
export type ToolPracticeKind = z.infer<typeof toolKindSchema>;

const count = z.number().int().min(1).max(50);
const mentalSettings = z.strictObject({
    mode: z.enum(['add-sub', 'multiply', 'divide', 'mixed']),
    difficulty: z.enum(['basic', 'standard', 'challenge']),
    count,
});
const appliedSettings = z.strictObject({
    grade: z.number().int().min(1).max(6),
    topic: z.string().max(32),
    count,
});
export const startPracticeSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('mental-math'), settings: mentalSettings, revision: z.number().int().positive().nullable() }),
    z.strictObject({ kind: z.literal('applied-math'), settings: appliedSettings, revision: z.number().int().positive().nullable() }),
]);
export const updatePracticeSchema = z.strictObject({
    kind: toolKindSchema,
    revision: z.number().int().positive(),
    answers: z.record(z.string().regex(/^[1-9]\d?$/), z.string().max(100)).refine(value => Object.keys(value).length <= 50, '答案数量超出限制'),
    submitted: z.boolean(),
});

export type PracticeSettings = z.infer<typeof mentalSettings> | z.infer<typeof appliedSettings>;
export type PracticeSession = {
    kind: 'mental-math'; revision: number; settings: z.infer<typeof mentalSettings>;
    questions: MathQuestion[]; answers: Record<string, string>; submitted: boolean;
} | {
    kind: 'applied-math'; revision: number; settings: z.infer<typeof appliedSettings>;
    questions: AppliedMathQuestion[]; answers: Record<string, string>; submitted: boolean;
};
