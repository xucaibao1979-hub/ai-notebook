import { promises as fs } from 'fs';
import path from 'path';
import { fetch as remoteFetch, Agent, ProxyAgent } from 'undici';
import { LearningExercise } from './learning';

export const PUBLIC_BANKS: Record<string, { file: string; grade: string }> = {
    '数学': { file: 'high_school_mathematics', grade: '高中' },
    '语文': { file: 'modern_chinese', grade: '语文基础' },
    '物理': { file: 'high_school_physics', grade: '高中' },
    '化学': { file: 'high_school_chemistry', grade: '高中' },
    '生物': { file: 'high_school_biology', grade: '高中' },
    '历史': { file: 'chinese_history', grade: '中国历史' },
    '地理': { file: 'high_school_geography', grade: '高中' },
    '政治': { file: 'high_school_politics', grade: '高中' },
};
const CACHE_DIRECTORY = path.join(process.cwd(), 'data', 'question-bank');
const LICENSE = 'CC BY-NC-SA 4.0';

// Handles commas, escaped quotes and line breaks inside quoted CSV fields.
export function parseQuestionCsv(text: string): Record<string, string>[] {
    const rows: string[][] = [];
    let row: string[] = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (quoted && text[i + 1] === '"') { field += '"'; i++; }
            else quoted = !quoted;
        } else if (char === ',' && !quoted) { row.push(field); field = ''; }
        else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += char;
    }
    if (quoted) throw new Error('题库 CSV 格式不完整');
    if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
    const headers = (rows.shift() || []).map(header => header.replace(/^\uFEFF/, ''));
    return rows.filter(fields => fields.some(Boolean)).map(fields => Object.fromEntries(headers.map((header, index) => [header, fields[index] || ''])));
}

async function downloadBank(url: string): Promise<string> {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY;
    // Explicit dispatchers avoid affecting auth/database/local requests through the global proxy.
    const dispatchers = [new Agent(), ...(proxy ? [new ProxyAgent(proxy)] : [])];
    try {
        return await Promise.any(dispatchers.map(async dispatcher=>{
            const response=await remoteFetch(url,{dispatcher,signal:AbortSignal.timeout(8000)});
            if(!response.ok)throw new Error(`题库服务返回 ${response.status}`);
            const text=await response.text();
            if(text.length>2_000_000)throw new Error('题库内容过大');
            return text;
        }));
    } catch {
        throw new Error('暂时无法连接公开题库，请稍后重试');
    } finally { await Promise.allSettled(dispatchers.map(dispatcher => dispatcher.close())); }
}

function parseBank(subject: string, text: string): LearningExercise[] {
    if (subject === '英语') {
        const bank = JSON.parse(text) as { examples: { input: string; target_scores: Record<string, number> }[] };
        return bank.examples.map((entry, index) => {
            const options = Object.keys(entry.target_scores);
            const correctIndex = options.findIndex(option => entry.target_scores[option] === 1);
            return {
                questionText: entry.input, options, correctOption: String.fromCharCode(65 + correctIndex),
                answerText: `${String.fromCharCode(65 + correctIndex)}. ${options[correctIndex]}`,
                analysis: '参考答案来自原题库。请结合故事语境，比较各谚语的含义与适用场景。可点击“AI解析”获取详细说明。',
                subject, knowledgePoints: ['英语阅读', '谚语理解'], difficulty: 'medium',
                provenance: { name: 'BIG-bench · 英语谚语阅读', url: 'https://github.com/google/BIG-bench/blob/main/bigbench/benchmark_tasks/english_proverbs/task.json', originalId: String(index + 1), license: 'Apache-2.0', licenseUrl: 'https://github.com/google/BIG-bench/blob/main/LICENSE', grade: '英语阅读' },
            };
        }).filter(entry => entry.options.length === 4 && /^[A-D]$/.test(entry.correctOption));
    }
    const bank = PUBLIC_BANKS[subject];
    return parseQuestionCsv(text).filter(row => row.Question?.trim() && /^[A-D]$/.test(row.Answer)
        && ['A', 'B', 'C', 'D'].every(key => row[key]?.trim())
        && !/如图|下图|图示|图中|见图|下表|表中|如表|如右图|如左图/.test(row.Question))
        .map(row => ({
            questionText: row.Question, options: [row.A, row.B, row.C, row.D], correctOption: row.Answer,
            answerText: `${row.Answer}. ${row[row.Answer]}`,
            analysis: '参考答案来自 CMMLU 原题库。该题库未附逐题解析，可点击“AI解析”获取解题步骤和易错点。',
            subject, knowledgePoints: [subject], difficulty: 'medium',
            provenance: { name: 'CMMLU · 公开学科题库', url: `https://github.com/haonan-li/CMMLU/blob/master/data/test/${bank.file}.csv`, originalId: row[''] || row.id, license: LICENSE, grade: bank.grade },
        }));
}

export async function loadPublicQuestions(subject: string): Promise<LearningExercise[]> {
    const bank = PUBLIC_BANKS[subject];
    if (!bank && subject !== '英语') throw new Error('该科目暂无公开题库');
    const filename = subject === '英语' ? 'english-proverbs.json' : `${bank.file}.csv`;
    const cacheFile = path.join(CACHE_DIRECTORY, filename);
    let cached: string | undefined;
    try {
        await fs.stat(cacheFile);
        cached = await fs.readFile(cacheFile, 'utf8');
        // A valid local copy is enough for a random reference sample. Waiting for
        // a remote refresh here made a daily recommendation take up to 24 seconds.
        const questions = parseBank(subject, cached);
        if (questions.length) return questions;
    } catch { /* Fetch initial data when no cache exists. */ }
    const url = subject === '英语'
        ? 'https://raw.githubusercontent.com/google/BIG-bench/main/bigbench/benchmark_tasks/english_proverbs/task.json'
        : `https://raw.githubusercontent.com/haonan-li/CMMLU/master/data/test/${bank.file}.csv`;
    try {
        const text = await downloadBank(url);
        const questions = parseBank(subject, text);
        if (!questions.length) throw new Error('公开题库暂时没有可用的题目');
        await fs.mkdir(CACHE_DIRECTORY, { recursive: true });
        await fs.writeFile(cacheFile, text, 'utf8');
        return questions;
    } catch (error) {
        if (cached) {
            const questions = parseBank(subject, cached);
            if (questions.length) return questions;
        }
        throw error;
    }
}
