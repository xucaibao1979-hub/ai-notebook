export type MathMode = 'add-sub' | 'multiply' | 'divide' | 'mixed';
export type MathDifficulty = 'basic' | 'standard' | 'challenge';
export type MathQuestion = { id: number; prompt: string; answer: number };
export type MathResult = { question: MathQuestion; input: string; correct: boolean };

function integer(max: number, rng: () => number) {
    return Math.floor(rng() * max) + 1;
}
function display(hundredths: number) {
    return String(Number((hundredths / 100).toFixed(2)));
}
function makeQuestion(kind: Exclude<MathMode, 'mixed'>, difficulty: MathDifficulty, rng: () => number): Omit<MathQuestion, 'id'> {
    const variant = difficulty !== 'basic' && rng() < (difficulty === 'challenge' ? 0.35 : 0.18);
    const decimal = difficulty !== 'basic' && rng() < (difficulty === 'challenge' ? 0.65 : 0.35);
    if (kind === 'add-sub') {
        const max = difficulty === 'basic' ? 50 : difficulty === 'standard' ? 100 : 1000;
        const scale = decimal ? (difficulty === 'standard' ? 10 : rng() < 0.5 ? 10 : 1) : 100;
        const a = integer(max * 100 / scale, rng) * scale;
        const b = integer(max * 100 / scale, rng) * scale;
        const subtract = rng() < 0.5;
        const left = subtract ? Math.max(a, b) : a, right = subtract ? Math.min(a, b) : b;
        const answer = (subtract ? left - right : left + right) / 100;
        if (variant) return { prompt: `${display(left)} ${subtract ? '−' : '+'} □ = ${display(subtract ? left - right : left + right)}`, answer: right / 100 };
        if (difficulty === 'challenge' && !decimal && rng() < 0.25) {
            const c = integer(Math.floor((left + right) / 100), rng) * 100;
            return { prompt: `${display(left)} + ${display(right)} − ${display(c)}`, answer: (left + right - c) / 100 };
        }
        return { prompt: `${display(left)} ${subtract ? '−' : '+'} ${display(right)}`, answer };
    }
    const limit = difficulty === 'basic' ? 9 : difficulty === 'standard' ? 12 : 30;
    const otherLimit = difficulty === 'challenge' ? 19 : limit;
    const first = integer(limit, rng), second = integer(otherLimit, rng);
    const factor = decimal ? integer(difficulty === 'challenge' ? 999 : 99, rng) : first * 100;
    const operand = decimal ? display(factor) : String(first);
    if (kind === 'multiply') {
        const product = factor * second;
        return variant
            ? { prompt: `${operand} × □ = ${display(product)}`, answer: second }
            : { prompt: `${operand} × ${second}`, answer: product / 100 };
    }
    const quotient = decimal ? factor : first * 100;
    const dividend = quotient * second;
    return variant
        ? { prompt: `${display(dividend)} ÷ □ = ${display(quotient)}`, answer: second }
        : { prompt: `${display(dividend)} ÷ ${second}`, answer: quotient / 100 };
}

export function generateMathQuestions(mode: MathMode, count: number, rng: () => number = Math.random, difficulty: MathDifficulty = 'basic'): MathQuestion[] {
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('题量须为 1 至 50');
    if (!['basic', 'standard', 'challenge'].includes(difficulty) || !['add-sub', 'multiply', 'divide', 'mixed'].includes(mode)) throw new Error('无效题型或难度');
    const kinds: Exclude<MathMode, 'mixed'>[] = ['add-sub', 'multiply', 'divide'];
    return Array.from({ length: count }, (_, index) => {
        const kind = mode === 'mixed' ? kinds[Math.floor(rng() * kinds.length)] : mode;
        return { id: index + 1, ...makeQuestion(kind, difficulty, rng) };
    });
}

export function gradeMathQuestions(questions: MathQuestion[], answers: Record<number, string>): MathResult[] {
    return questions.map(question => {
        const input = (answers[question.id] ?? '').trim();
        return { question, input, correct: /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input) && Math.round(Number(input) * 100) === Math.round(question.answer * 100) };
    });
}
