import { describe, expect, it } from 'vitest';
import { appliedMathTopics, generateAppliedMathQuestions, gradeAppliedMathQuestions } from '@/lib/applied-math';

type Check = [RegExp, (n: number[]) => number];
const checks: Record<string, Check[]> = {
    'add-within-20': [
        [/^小明有 (\d+) 支铅笔，又买了 (\d+) 支/, ([a, b]) => a + b],
        [/^池塘里有 (\d+) 只鸭子，又游来 (\d+) 只/, ([a, b]) => a + b],
        [/^红队得了 (\d+) 分，蓝队得了 (\d+) 分/, ([a, b]) => a + b],
    ],
    'subtract-within-20': [
        [/^篮子里原有 (\d+) 个苹果，吃掉 (\d+) 个/, ([a, b]) => a - b],
        [/^操场上有 (\d+) 名同学，其中 (\d+) 名/, ([a, b]) => a - b],
        [/^小红有 (\d+) 张贴纸，比小刚多 (\d+) 张/, ([a, b]) => a - b],
    ],
    'add-sub-within-100': [
        [/^书架原有 (\d+) 本书，借出 (\d+) 本，又还回 (\d+) 本/, ([a, b, c]) => a - b + c],
        [/^公交车上有 (\d+) 人，到站上来 (\d+) 人，下去 (\d+) 人/, ([a, b, c]) => a + b - c],
        [/^小兰有 (\d+) 元，买文具花了 (\d+) 元，妈妈又给了 (\d+) 元/, ([a, b, c]) => a - b + c],
    ],
    multiplication: [
        [/^有 (\d+) 盒蜡笔，每盒 (\d+) 支/, ([a, b]) => a * b],
        [/^教室摆了 (\d+) 排椅子，每排 (\d+) 把/, ([a, b]) => a * b],
        [/^一张公交车票 (\d+) 元，买 (\d+) 张/, ([a, b]) => a * b],
    ],
    division: [
        [/^把 (\d+) 颗糖平均分给 (\d+) 个孩子/, ([a, b]) => a / b],
        [/^有 (\d+) 本书，每层书架放 (\d+) 本/, ([a, b]) => a / b],
        [/^将 (\d+) 朵花扎成 (\d+) 束/, ([a, b]) => a / b],
    ],
    'two-step': [
        [/^有 (\d+) 盒饼干，每盒 (\d+) 块，吃掉 (\d+) 块/, ([a, b, c]) => a * b - c],
        [/^每排种 (\d+) 棵树，种了 (\d+) 排，又补种 (\d+) 棵/, ([a, b, c]) => a * b + c],
        [/^买了 (\d+) 袋糖，每袋 (\d+) 颗，分给同学 (\d+) 颗/, ([a, b, c]) => a * b - c],
    ],
    'multiplication-large': [
        [/^工厂每天生产 (\d+) 个零件，生产 (\d+) 天/, ([a, b]) => a * b],
        [/^一套书售价 (\d+) 元，学校买 (\d+) 套/, ([a, b]) => a * b],
        [/^电影院每排有 (\d+) 个座位，开放 (\d+) 排/, ([a, b]) => a * b],
    ],
    average: [
        [/^(\d+) 名同学一共收集了 (\d+) 张卡片/, ([a, b]) => b / a],
        [/^记录了 (\d+) 天气温，平均每天 (\d+) 摄氏度/, ([a, b]) => a * b],
        [/^(\d+) 次跳绳平均每次 (\d+) 下，前 (\d+) 次一共跳了 (\d+) 下/, ([a, b, c, d]) => { expect(c).toBe(a - 1); return a * b - d; }],
    ],
    'decimal-multiplication': [
        [/^一根彩带长 (\d+\.\d+) 米，(\d+) 根/, ([a, b]) => a * b],
        [/^苹果每千克 (\d+\.\d+) 元，买 (\d+) 千克/, ([a, b]) => a * b],
        [/^一块长方形菜地长 (\d+\.\d+) 米，宽 (\d+\.\d+) 米/, ([a, b]) => a * b],
    ],
    'decimal-division': [
        [/^把 (\d+\.\d+) 升果汁平均倒入 (\d+) 个杯子/, ([a, b]) => a / b],
        [/^一条路长 (\d+\.\d+) 千米，(\d+) 小时走完/, ([a, b]) => a / b],
        [/^有 (\d+\.\d+) 米绳子，每段剪 (\d+\.\d+) 米/, ([a, b]) => a / b],
    ],
    percentage: [
        [/^图书角有 (\d+) 本书，其中 (\d+)%/, ([a, b]) => a * b / 100],
        [/^一件衣服原价 (\d+) 元，降价 (\d+)%/, ([a, b]) => a * b / 100],
        [/^班级共有 (\d+) 人，(\d+)% 参加合唱/, ([a, b]) => a * (100 - b) / 100],
    ],
    ratio: [
        [/^把 (\d+) 张贴纸按 (\d+)∶(\d+) 分给甲乙/, ([total, a, b]) => total * a / (a + b)],
        [/^红蓝两种珠子按 (\d+)∶(\d+) 装袋，共有 (\d+) 颗/, ([a, b, total]) => total * b / (a + b)],
        [/^两队共种 (\d+) 棵树，甲乙种树数之比为 (\d+)∶(\d+)/, ([total, a, b]) => total * Math.abs(a - b) / (a + b)],
    ],
};

const ranges: Record<string, ((n: number[]) => void)[]> = {
    'add-within-20': Array.from({ length: 3 }, () => ([a, b]: number[]) => {
        expect(a).toBeGreaterThanOrEqual(2);
        expect(a + b).toBeLessThanOrEqual(20);
    }),
    'subtract-within-20': Array.from({ length: 3 }, () => ([total, part]: number[]) => {
        expect(total).toBeLessThanOrEqual(20);
        expect(part).toBeGreaterThan(0);
        expect(part).toBeLessThan(total);
    }),
    'add-sub-within-100': [
        ([a, b, c]) => { expect(b).toBeLessThan(a); expect(a - b + c).toBeLessThanOrEqual(100); },
        ([a, b, c]) => { expect(a).toBeLessThanOrEqual(35); expect(a + b).toBeLessThanOrEqual(47); expect(c).toBeLessThan(a + b); },
        ([a, b, c]) => { expect(b).toBeLessThan(a); expect(a - b + c).toBeLessThanOrEqual(100); },
    ],
    multiplication: [
        ([a, b]) => { expect(a).toBeLessThanOrEqual(9); expect(b).toBeLessThanOrEqual(9); },
        ([rows, chairs]) => { expect(rows).toBeGreaterThanOrEqual(3); expect(rows).toBeLessThanOrEqual(6); expect(chairs).toBeLessThanOrEqual(8); },
        ([price, tickets]) => { expect(price).toBeLessThanOrEqual(9); expect(tickets).toBeLessThanOrEqual(9); },
    ],
    division: Array.from({ length: 3 }, () => ([total, divisor]: number[]) => {
        expect(total).toBeLessThanOrEqual(81);
        expect(total % divisor).toBe(0);
    }),
    'two-step': [
        ([a, b, c]) => { expect(c).toBeLessThan(a * b); },
        ([a, b, c]) => { expect(c).toBeLessThanOrEqual(12); expect(a * b + c).toBeLessThanOrEqual(76); },
        ([a, b, c]) => { expect(c).toBeLessThan(a * b); },
    ],
    'multiplication-large': [
        ([perDay, days]) => { expect(perDay).toBeGreaterThanOrEqual(101); expect(perDay).toBeLessThanOrEqual(299); expect(days).toBeLessThanOrEqual(29); },
        ([price, sets]) => { expect(price).toBeGreaterThanOrEqual(101); expect(price).toBeLessThanOrEqual(299); expect(sets).toBeLessThanOrEqual(29); },
        ([seats, rows]) => { expect(seats).toBeGreaterThanOrEqual(20); expect(seats).toBeLessThanOrEqual(40); expect(rows).toBeGreaterThanOrEqual(12); expect(rows).toBeLessThanOrEqual(29); },
    ],
    average: [
        ([students, cards]) => { expect(students).toBeLessThanOrEqual(8); expect(cards / students).toBeLessThanOrEqual(45); },
        ([days, mean]) => { expect(days).toBeLessThanOrEqual(7); expect(mean).toBeGreaterThanOrEqual(10); expect(mean).toBeLessThanOrEqual(28); },
        ([times, mean, , count]) => { expect(times).toBeLessThanOrEqual(8); expect(mean).toBeLessThanOrEqual(45); expect(count).toBeGreaterThan(0); expect(times * mean - count).toBeGreaterThan(0); },
    ],
    'decimal-multiplication': [
        ([length, count]) => { expect(length).toBeLessThanOrEqual(5.9); expect(count).toBeLessThanOrEqual(9); },
        ([price, weight]) => { expect(price).toBeGreaterThanOrEqual(4); expect(price).toBeLessThanOrEqual(12); expect(weight).toBeLessThanOrEqual(9); },
        ([length, width]) => { expect(length).toBeGreaterThanOrEqual(3); expect(length).toBeLessThanOrEqual(9); expect(width).toBeLessThan(length); },
    ],
    'decimal-division': [
        ([juice, cups]) => { expect(cups).toBeLessThanOrEqual(6); expect(juice / cups).toBeLessThanOrEqual(0.8); expect(juice).toBeLessThanOrEqual(4.8); },
        ([distance, hours]) => { expect(hours).toBeLessThanOrEqual(8); expect(distance / hours).toBeLessThanOrEqual(5.9); },
        ([rope, piece]) => { expect(rope).toBeLessThanOrEqual(47.2); expect(rope / piece).toBeLessThanOrEqual(8); },
    ],
    percentage: [
        ([books, p]) => { expect(books).toBeGreaterThanOrEqual(40); expect(books).toBeLessThanOrEqual(200); expect(Number.isInteger(books * p / 100)).toBe(true); },
        ([price, p]) => { expect(price).toBeGreaterThanOrEqual(100); expect(price).toBeLessThanOrEqual(500); expect(Number.isInteger(price * p / 100)).toBe(true); },
        ([students, p]) => { expect(students).toBeGreaterThanOrEqual(30); expect(students).toBeLessThanOrEqual(50); expect(Number.isInteger(students * p / 100)).toBe(true); expect(Number.isInteger(students * (100 - p) / 100)).toBe(true); },
    ],
    ratio: [
        ([total, a, b]) => { expect(total).toBeLessThanOrEqual(100); expect(total % (a + b)).toBe(0); },
        ([a, b, total]) => { expect(total).toBeLessThanOrEqual(120); expect(total % (a + b)).toBe(0); },
        ([total, a, b]) => { expect(total).toBeLessThanOrEqual(80); expect(total % (a + b)).toBe(0); },
    ],
};

describe('应用算通用年级模板', () => {
    it('1-6 年级每个知识点三种模板均衡覆盖、题面不重复且答案可独立验算', () => {
        for (let grade = 1; grade <= 6; grade++) {
            for (const { value } of appliedMathTopics(grade)) {
                for (const rng of [() => 0, () => 0.5, () => 0.999]) {
                    const questions = generateAppliedMathQuestions(grade, 50, value, rng);
                    const counts = [0, 0, 0];
                    expect(questions.map(question => question.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
                    expect(new Set(questions.map(question => question.prompt)).size).toBe(50);
                    for (const question of questions) {
                        expect(question.topic).toBe(value);
                        const matches = checks[value].map(([pattern]) => pattern.exec(question.prompt));
                        expect(matches.filter(Boolean)).toHaveLength(1);
                        const mode = matches.findIndex(Boolean);
                        counts[mode]++;
                        const numbers = matches[mode]!.slice(1).map(Number);
                        expect(question.answer).toBeCloseTo(checks[value][mode][1](numbers), 8);
                        expect(question.solution).toMatch(/ = -?\d+(?:\.\d+)?$/);
                        expect(Number(question.solution!.split(' = ').at(-1))).toBeCloseTo(question.answer, 8);
                        for (const n of numbers) {
                            if (value === 'average' && mode === 2 && n === numbers[2]) continue; // 前 n-1 次仅用于叙述，列式使用总次数
                            expect(question.solution).toContain(String(n));
                        }
                        ranges[value][mode](numbers);
                        if (value === 'percentage') expect([10, 20, 25, 50]).toContain(numbers[1]);
                        if (value === 'ratio') {
                            const [a, b] = mode === 1 ? numbers.slice(0, 2) : numbers.slice(1, 3);
                            expect(a).toBeGreaterThanOrEqual(2);
                            expect(a).toBeLessThanOrEqual(5);
                            expect(b).toBeGreaterThanOrEqual(2);
                            expect(b).toBeLessThanOrEqual(5);
                        }
                        expect(question.answer).toBeGreaterThanOrEqual(0);
                    }
                    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
                }
            }
        }
    });

    it('不指定知识点时只在该年级知识点中选题，支持注入 rng 复现', () => {
        const sequence = [0, 0.17, 0.5, 0.99];
        const seeded = () => { let i = 0; return () => sequence[i++ % sequence.length]; };
        for (let grade = 1; grade <= 6; grade++) {
            const first = generateAppliedMathQuestions(grade, 50, undefined, seeded());
            expect(first).toEqual(generateAppliedMathQuestions(grade, 50, undefined, seeded()));
            expect(first.every(question => appliedMathTopics(grade).some(topic => topic.value === question.topic))).toBe(true);
            expect(new Set(first.map(question => question.prompt)).size).toBe(50);
        }
        expect(generateAppliedMathQuestions(1, 1, 'add-within-20', () => 0)).toHaveLength(1);
        expect(generateAppliedMathQuestions(5, 50, 'decimal-multiplication', seeded()))
            .toEqual(generateAppliedMathQuestions(5, 50, 'decimal-multiplication', seeded()));
        expect(appliedMathTopics(5).map(item => item.value)).toEqual(['decimal-multiplication', 'decimal-division']);
    });

    it('拒绝无效年级、题量和跨年级知识点', () => {
        for (const grade of [0, 7, 1.5]) expect(() => generateAppliedMathQuestions(grade, 1)).toThrow();
        for (const count of [0, 51, 1.5]) expect(() => generateAppliedMathQuestions(1, count)).toThrow();
        expect(() => generateAppliedMathQuestions(1, 1, 'percentage')).toThrow();
        expect(() => generateAppliedMathQuestions(1, 1, 'unknown')).toThrow();
    });

    it('核对整数和小数，空白及非法数字不得通过', () => {
        const questions = [
            { id: 1, prompt: '整数题', answer: 12, topic: 'multiplication' },
            { id: 2, prompt: '小数题', answer: 2.5, topic: 'decimal-division' },
            { id: 3, prompt: '零答案题', answer: 0, topic: 'percentage' },
        ];
        expect(gradeAppliedMathQuestions(questions, { 1: '12', 2: ' 2.5 ', 3: '' }).map(row => row.correct)).toEqual([true, true, false]);
        expect(gradeAppliedMathQuestions(questions, { 1: '12abc', 2: '2,5', 3: '0' }).map(row => row.correct)).toEqual([false, false, true]);
    });
});
