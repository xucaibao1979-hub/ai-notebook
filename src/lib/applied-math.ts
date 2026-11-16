export type AppliedMathQuestion = { id: number; prompt: string; answer: number; topic: string; solution?: string };

export function appliedMathSolution(topic: string, prompt: string): string {
    const values = [...prompt.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
    const [a, b, c, d] = values;
    const formula = (expression: string, answer: number) => `${expression} = ${Number(answer.toFixed(8))}`;
    switch (topic) {
        case 'add-within-20': return formula(`${a} + ${b}`, a + b);
        case 'subtract-within-20': return formula(`${a} - ${b}`, a - b);
        case 'add-sub-within-100': return prompt.startsWith('公交车') ? formula(`${a} + ${b} - ${c}`, a + b - c) : formula(`${a} - ${b} + ${c}`, a - b + c);
        case 'multiplication':
        case 'multiplication-large': return formula(`${a} × ${b}`, a * b);
        case 'division': return formula(`${a} ÷ ${b}`, a / b);
        case 'two-step': return prompt.startsWith('每排种') ? formula(`${a} × ${b} + ${c}`, a * b + c) : formula(`${a} × ${b} - ${c}`, a * b - c);
        case 'average':
            if (prompt.startsWith('记录了')) return formula(`${a} × ${b}`, a * b);
            if (prompt.includes('前 ')) return formula(`${a} × ${b} - ${d}`, a * b - d);
            return formula(`${b} ÷ ${a}`, b / a);
        case 'decimal-multiplication': return formula(`${a} × ${b}`, a * b);
        case 'decimal-division': return formula(`${a} ÷ ${b}`, a / b);
        case 'percentage': return prompt.startsWith('班级') ? formula(`${a} × (100 - ${b}) ÷ 100`, a * (100 - b) / 100) : formula(`${a} × ${b} ÷ 100`, a * b / 100);
        case 'ratio':
            if (prompt.startsWith('红蓝')) return formula(`${c} ÷ (${a} + ${b}) × ${b}`, c / (a + b) * b);
            if (prompt.startsWith('两队')) return formula(`${a} ÷ (${b} + ${c}) × |${b} - ${c}|`, a / (b + c) * Math.abs(b - c));
            return formula(`${a} ÷ (${b} + ${c}) × ${b}`, a / (b + c) * b);
        default: throw new Error('无效知识点');
    }
}
export type AppliedMathTopic = { value: string; label: string };

const topics: Record<number, AppliedMathTopic[]> = {
    1: [{ value: 'add-within-20', label: '20以内加法' }, { value: 'subtract-within-20', label: '20以内减法' }],
    2: [{ value: 'add-sub-within-100', label: '100以内加减法' }, { value: 'multiplication', label: '乘法应用' }],
    3: [{ value: 'division', label: '平均分' }, { value: 'two-step', label: '两步计算' }],
    4: [{ value: 'multiplication-large', label: '多位数乘法' }, { value: 'average', label: '平均数' }],
    5: [{ value: 'decimal-multiplication', label: '小数乘法' }, { value: 'decimal-division', label: '小数除法' }],
    6: [{ value: 'percentage', label: '百分数' }, { value: 'ratio', label: '按比例分配' }],
};

export function appliedMathTopics(grade: number): AppliedMathTopic[] {
    return topics[grade]?.map(topic => ({ ...topic })) ?? [];
}

function randomInt(min: number, max: number, rng: () => number): number {
    return min + Math.floor(rng() * (max - min + 1));
}

function makeQuestion(topic: string, mode: number, rng: () => number): Pick<AppliedMathQuestion, 'prompt' | 'answer'> {
    switch (topic) {
        case 'add-within-20': {
            const a = randomInt(2, 10, rng), b = randomInt(1, 20 - a, rng);
            if (mode === 0) return { prompt: `小明有 ${a} 支铅笔，又买了 ${b} 支，现在共有多少支铅笔？`, answer: a + b };
            if (mode === 1) return { prompt: `池塘里有 ${a} 只鸭子，又游来 ${b} 只，现在有多少只鸭子？`, answer: a + b };
            return { prompt: `红队得了 ${a} 分，蓝队得了 ${b} 分，两队一共得了多少分？`, answer: a + b };
        }
        case 'subtract-within-20': {
            const total = randomInt(3, 20, rng), part = randomInt(1, total - 1, rng);
            if (mode === 0) return { prompt: `篮子里原有 ${total} 个苹果，吃掉 ${part} 个，还剩多少个？`, answer: total - part };
            if (mode === 1) return { prompt: `操场上有 ${total} 名同学，其中 ${part} 名在跳绳，其余在跑步，跑步的有几名？`, answer: total - part };
            return { prompt: `小红有 ${total} 张贴纸，比小刚多 ${part} 张，小刚有多少张？`, answer: total - part };
        }
        case 'add-sub-within-100': {
            if (mode === 1) {
                const passengers = randomInt(15, 35, rng), boarding = randomInt(2, 12, rng), leaving = randomInt(1, 12, rng);
                return { prompt: `公交车上有 ${passengers} 人，到站上来 ${boarding} 人，下去 ${leaving} 人，车上还有多少人？`, answer: passengers + boarding - leaving };
            }
            const a = randomInt(20, 60, rng), b = randomInt(1, 20, rng), c = randomInt(1, 20, rng);
            if (mode === 0) return { prompt: `书架原有 ${a} 本书，借出 ${b} 本，又还回 ${c} 本，现在有多少本？`, answer: a - b + c };
            return { prompt: `小兰有 ${a} 元，买文具花了 ${b} 元，妈妈又给了 ${c} 元，她现在有多少元？`, answer: a - b + c };
        }
        case 'multiplication': {
            if (mode === 1) {
                const rows = randomInt(3, 6, rng), chairs = randomInt(4, 8, rng);
                return { prompt: `教室摆了 ${rows} 排椅子，每排 ${chairs} 把，共摆了多少把？`, answer: rows * chairs };
            }
            const a = randomInt(2, 9, rng), b = randomInt(2, 9, rng);
            if (mode === 0) return { prompt: `有 ${a} 盒蜡笔，每盒 ${b} 支，一共有多少支？`, answer: a * b };
            return { prompt: `一张公交车票 ${a} 元，买 ${b} 张需要多少元？`, answer: a * b };
        }
        case 'division': {
            const a = randomInt(2, 9, rng), b = randomInt(2, 9, rng);
            if (mode === 0) return { prompt: `把 ${a * b} 颗糖平均分给 ${a} 个孩子，每人多少颗？`, answer: b };
            if (mode === 1) return { prompt: `有 ${a * b} 本书，每层书架放 ${b} 本，需要几层？`, answer: a };
            return { prompt: `将 ${a * b} 朵花扎成 ${a} 束，每束同样多，每束几朵？`, answer: b };
        }
        case 'two-step': {
            const a = randomInt(2, 8, rng), b = randomInt(2, 8, rng);
            const c = randomInt(1, mode === 1 ? 12 : a * b - 1, rng);
            if (mode === 0) return { prompt: `有 ${a} 盒饼干，每盒 ${b} 块，吃掉 ${c} 块，还剩几块？`, answer: a * b - c };
            if (mode === 1) return { prompt: `每排种 ${b} 棵树，种了 ${a} 排，又补种 ${c} 棵，共有几棵？`, answer: a * b + c };
            return { prompt: `买了 ${a} 袋糖，每袋 ${b} 颗，分给同学 ${c} 颗，还余几颗？`, answer: a * b - c };
        }
        case 'multiplication-large': {
            if (mode === 2) {
                const seats = randomInt(20, 40, rng), rows = randomInt(12, 29, rng);
                return { prompt: `电影院每排有 ${seats} 个座位，开放 ${rows} 排，共有多少个座位？`, answer: seats * rows };
            }
            const a = randomInt(101, 299, rng), b = randomInt(12, 29, rng);
            if (mode === 0) return { prompt: `工厂每天生产 ${a} 个零件，生产 ${b} 天，一共生产多少个？`, answer: a * b };
            return { prompt: `一套书售价 ${a} 元，学校买 ${b} 套，需要多少元？`, answer: a * b };
        }
        case 'average': {
            if (mode === 1) {
                const days = randomInt(3, 7, rng), mean = randomInt(10, 28, rng);
                return { prompt: `记录了 ${days} 天气温，平均每天 ${mean} 摄氏度，这些天的气温总和是多少摄氏度？`, answer: days * mean };
            }
            const n = randomInt(3, 8, rng), mean = randomInt(12, 45, rng);
            if (mode === 0) return { prompt: `${n} 名同学一共收集了 ${n * mean} 张卡片，平均每人几张？`, answer: mean };
            const delta = randomInt(1, Math.min(9, mean - 1), rng);
            return { prompt: `${n} 次跳绳平均每次 ${mean} 下，前 ${n - 1} 次一共跳了 ${(n - 1) * mean + delta} 下，最后一次跳了多少下？`, answer: mean - delta };
        }
        case 'decimal-multiplication': {
            const b = randomInt(2, 9, rng);
            if (mode === 0) {
                const length = randomInt(11, 59, rng);
                return { prompt: `一根彩带长 ${(length / 10).toFixed(1)} 米，${b} 根同样的彩带共长多少米？`, answer: length * b / 10 };
            }
            if (mode === 1) {
                const price = randomInt(40, 120, rng);
                return { prompt: `苹果每千克 ${(price / 10).toFixed(1)} 元，买 ${b} 千克要付多少元？`, answer: price * b / 10 };
            }
            const length = randomInt(30, 90, rng), width = randomInt(12, 29, rng);
            return { prompt: `一块长方形菜地长 ${(length / 10).toFixed(1)} 米，宽 ${(width / 10).toFixed(1)} 米，面积是多少平方米？`, answer: length * width / 100 };
        }
        case 'decimal-division': {
            if (mode === 0) {
                const perCup = randomInt(2, 8, rng), cups = randomInt(2, 6, rng);
                return { prompt: `把 ${(perCup * cups / 10).toFixed(1)} 升果汁平均倒入 ${cups} 个杯子，每杯多少升？`, answer: perCup / 10 };
            }
            const a = randomInt(11, 59, rng), b = randomInt(2, 8, rng);
            if (mode === 1) return { prompt: `一条路长 ${(a * b / 10).toFixed(1)} 千米，${b} 小时走完，平均每小时走多少千米？`, answer: a / 10 };
            return { prompt: `有 ${(a * b / 10).toFixed(1)} 米绳子，每段剪 ${(a / 10).toFixed(1)} 米，可以剪成几段？`, answer: b };
        }
        case 'percentage': {
            const p = [10, 20, 25, 50][randomInt(0, 3, rng)];
            if (mode === 0) {
                const total = randomInt(2, 10, rng) * 20;
                return { prompt: `图书角有 ${total} 本书，其中 ${p}% 是故事书，故事书有多少本？`, answer: total * p / 100 };
            }
            if (mode === 1) {
                const price = randomInt(5, 25, rng) * 20;
                return { prompt: `一件衣服原价 ${price} 元，降价 ${p}%，便宜了多少元？`, answer: price * p / 100 };
            }
            const step = p === 10 ? 10 : p === 20 ? 5 : p === 25 ? 4 : 2;
            const size = randomInt(Math.ceil(30 / step), Math.floor(50 / step), rng) * step;
            return { prompt: `班级共有 ${size} 人，${p}% 参加合唱，未参加的有多少人？`, answer: size * (100 - p) / 100 };
        }
        case 'ratio': {
            const a = randomInt(2, 5, rng), b = randomInt(2, 5, rng);
            if (mode === 0) {
                const unit = randomInt(3, 10, rng);
                return { prompt: `把 ${(a + b) * unit} 张贴纸按 ${a}∶${b} 分给甲乙，甲得多少张？`, answer: a * unit };
            }
            if (mode === 1) {
                const unit = randomInt(3, 12, rng);
                return { prompt: `红蓝两种珠子按 ${a}∶${b} 装袋，共有 ${(a + b) * unit} 颗，蓝珠有多少颗？`, answer: b * unit };
            }
            const unit = randomInt(3, 8, rng);
            return { prompt: `两队共种 ${(a + b) * unit} 棵树，甲乙种树数之比为 ${a}∶${b}，两队相差多少棵？`, answer: Math.abs(a - b) * unit };
        }
        default: throw new Error('无效知识点');
    }
}

export function generateAppliedMathQuestions(grade: number, count: number, topic?: string, rng: () => number = Math.random): AppliedMathQuestion[] {
    const available = appliedMathTopics(grade);
    if (!Number.isInteger(grade) || !available.length) throw new Error('年级须为 1 至 6');
    if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('题量须为 1 至 50');
    if (topic && !available.some(item => item.value === topic)) throw new Error('无效知识点');
    const seen = new Set<string>();
    const usedModes = new Map<string, number>();
    const offsets = new Map<string, number>();
    return Array.from({ length: count }, (_, index) => {
        const selected = topic || available[randomInt(0, available.length - 1, rng)].value;
        if (!offsets.has(selected)) offsets.set(selected, randomInt(0, 2, rng));
        const mode = ((offsets.get(selected) ?? 0) + (usedModes.get(selected) ?? 0)) % 3;
        usedModes.set(selected, (usedModes.get(selected) ?? 0) + 1);
        let question = makeQuestion(selected, mode, rng);
        for (let attempt = 1; seen.has(question.prompt); attempt++) {
            if (attempt > 2000) throw new Error('无法生成不重复题目');
            let state = (Math.imul(index + 1, 2654435761) + Math.imul(attempt, 2246822519)) >>> 0;
            question = makeQuestion(selected, mode, () => {
                state ^= state << 13;
                state ^= state >>> 17;
                state ^= state << 5;
                return (state >>> 0) / 4294967296;
            });
        }
        seen.add(question.prompt);
        return { id: index + 1, topic: selected, ...question, solution: appliedMathSolution(selected, question.prompt) };
    });
}

export function gradeAppliedMathQuestions(questions: AppliedMathQuestion[], answers: Record<number, string>) {
    return questions.map(question => {
        const input = (answers[question.id] ?? '').trim();
        return { question, input, correct: /^(?:\d+)(?:\.\d+)?$/.test(input) && Number(input) === question.answer };
    });
}
