import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {syncImageSources,IMAGE_SOURCE_SEEDS} from './sync-image-sources';
import { inferPaperMetadata, inferKnowledgeGrade, RECENT_EXAM_YEARS } from '../src/lib/knowledge-library';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePaperHtml } = require('./library-parser.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
const prisma = new PrismaClient();
const directory = path.join(process.cwd(), 'data', 'knowledge-library');
const progressFile = path.join(directory, 'sync-status.json');
const lockPath = path.join(directory, 'sync.lock');
let ownsLock = false;
const status = { state: 'running', startedAt: new Date().toISOString(), completedAt: '', discovered: 0, imported: 0, skipped: 0, failed: 0, processed: 0, years: RECENT_EXAM_YEARS, errors: [] as { url: string; message: string }[], coverage: '公开目录范围；不代表全国所有原卷均已收录。来源年份、答案与题干质量尚待核验。' };
let lastRequest = 0;
let statusWrites: Promise<void> = Promise.resolve();

async function writeStatus() {
    statusWrites = statusWrites.catch(() => {}).then(async () => {
        await fs.mkdir(directory, { recursive: true });
        const temporary = `${progressFile}.tmp`;
        await fs.writeFile(temporary, JSON.stringify(status, null, 2));
        await fs.rename(temporary, progressFile);
    });
    return statusWrites;
}
async function fetchText(url: string) {
    const scheduledAt = Math.max(Date.now(), lastRequest + 650);
    lastRequest = scheduledAt;
    const wait = scheduledAt - Date.now();
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WrongNotebookPersonalStudy/1.0 (+local-archive)', Accept: 'text/html,application/xml' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 3_000_000) throw new Error('页面超过大小限制');
    return text;
}

async function main() {
    await fs.mkdir(directory, { recursive: true });
    try {
        const handle = await fs.open(lockPath, 'wx');
        ownsLock = true;
        await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
        await handle.close();
    } catch { throw new Error('已有抓取任务正在进行；若上次进程异常退出，请检查 data/knowledge-library/sync.lock 后重试'); }
    await writeStatus();
    const sitemapPath = path.join(directory, 'source-sitemap.xml');
    let xml: string;
    try { xml = await fetchText('https://kaosj.com/sitemap.xml'); await fs.writeFile(sitemapPath, xml); }
    catch { xml = await fs.readFile(sitemapPath, 'utf8'); }
    const document: Document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
    const urls = [...new Set([...document.querySelectorAll('loc')].map(loc => loc.textContent || '').filter(url => /^https:\/\/kaosj\.com\/papers\/202[2-6]\//.test(url)))];
    status.discovered = urls.length;
    await fs.writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify({ source: 'https://kaosj.com/sitemap.xml', discoveredAt: new Date().toISOString(), urls }, null, 2));
    const force = process.argv.includes('--refresh');
    const reparseCache = process.argv.includes('--reparse-cache');
    const limitIndex = process.argv.indexOf('--limit');
    const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : urls.length;
    const ordered = urls.sort((a, b) => b.localeCompare(a));
    const selectedUrls = ordered.slice(0, limit);
    let nextUrl = 0;
    async function processUrl(url: string) {
        try {
            if (!force && !reparseCache && await prisma.knowledgePaper.findUnique({ where: { sourceUrl: url }, select: { id: true } })) { status.skipped++; return; }
            const rawPath = path.join(directory, 'raw', `${createHash('sha256').update(url).digest('hex')}.html`);
            const html = reparseCache ? await fs.readFile(rawPath, 'utf8') : await fetchText(url);
            const parsed = parsePaperHtml(html, url) as { title: string; questions: { number: string; questionHtml: string; questionText: string; answerHtml: string; answerLeakRisk: boolean; wholePaper?: boolean }[]; attachments: object[] };
            const meta = inferPaperMetadata(parsed.title);
            if (/韩国|日本|英国|美国|新加坡|澳大利亚/.test(parsed.title)) {
                await prisma.knowledgePaper.deleteMany({ where: { sourceUrl: url, sourceName: '考试卷网 · 公开整理版' } });
                status.skipped++;
                return;
            }
            if (!RECENT_EXAM_YEARS.includes(meta.year) || !meta.examType || !meta.subject || /模拟|一模|二模|三模|月考|期中|期末/.test(parsed.title)) { status.skipped++; return; }
            let questions = parsed.questions.map(({ questionText, ...question }) => ({ ...question, ...(question.wholePaper ? { grade: null, gradeBasis: '整卷暂未逐题拆分，知识年级待确认', knowledgePoints: [] } : inferKnowledgeGrade(questionText, meta.subject, meta.examGrade)) }));
            const previous = await prisma.knowledgePaper.findUnique({ where: { sourceUrl: url }, select: { questions: true } });
            if (previous) {
                const reviewed = (JSON.parse(previous.questions) as { number: string; locallyReviewed?: boolean; originalQuestionHtml?: string; correctedMarkdown?: string; reviewedAt?: string; reviewedBy?: string }[]).filter(question => question.locallyReviewed);
                if (reviewed.length) {
                    await fs.mkdir(path.join(directory, 'corrections'), { recursive: true });
                    await fs.writeFile(path.join(directory, 'corrections', `${createHash('sha256').update(url).digest('hex')}.json`), JSON.stringify(reviewed, null, 2));
                    questions = questions.map(question => { const saved = reviewed.find(saved => saved.number === question.number && saved.originalQuestionHtml === question.questionHtml); return saved ? { ...question, ...saved, answerLeakRisk: false } : question; });
                }
            }
            const questionCount = questions.filter(question => !question.wholePaper).length;
            const answerCount = questions.filter(question => !question.wholePaper && question.answerHtml).length;
            const riskCount = questions.filter(question => question.answerLeakRisk).length;
            const grades = [...new Set(questions.map(question => question.grade).filter((grade): grade is number => grade !== null))].sort();
            const data = {
                ...meta, title: parsed.title, sourceName: '考试卷网 · 公开整理版', sourceUrl: url,
                questions: JSON.stringify(questions), knowledgeGrades: JSON.stringify(grades), questionCount, answerCount,
                attachments: JSON.stringify(parsed.attachments), fetchedAt: new Date(),
                status: questions.some(question => question.wholePaper) ? 'whole_paper' : riskCount ? 'needs_review' : answerCount < questions.length ? 'partial' : 'unverified',
                qualityNote: `来源标称年份 ${meta.year}；未与考试机构原卷逐题核验。${questions.some(question => question.wholePaper) ? '已保存完整原文与可分离的答案，但暂未逐题拆分，不计入逐题统计。' : ''}${riskCount ? `${riskCount} 段题干可能混入答案，隐藏答案时默认折叠。` : ''}${answerCount < questionCount ? `${questionCount - answerCount} 道题缺少独立答案。` : ''}知识年级由关键词推断，未标注题保留“待确认”。`,
            };
            await prisma.knowledgePaper.upsert({ where: { sourceUrl: url }, create: data, update: data });
            status.imported++;
            await fs.mkdir(path.join(directory, 'raw'), { recursive: true });
            await fs.writeFile(path.join(directory, 'raw', `${createHash('sha256').update(url).digest('hex')}.html`), html);
        } catch (error) {
            status.failed++;
            status.errors.push({ url, message: error instanceof Error ? error.message : '未知错误' });
            if (error instanceof Error && /HTTP (403|429)/.test(error.message)) status.state = 'rate_limited';
        } finally {
            status.processed++;
            if (status.processed % 10 === 0) { await writeStatus(); console.log(`[Library] ${status.processed}/${status.discovered}, imported=${status.imported}, skipped=${status.skipped}, failed=${status.failed}`); }
        }
    }
    // Overlap network wait and parsing while maintaining one globally scheduled request every 650 ms.
    await Promise.all(Array.from({ length: 2 }, async () => {
        while (nextUrl < selectedUrls.length && status.state === 'running') {
            const url = selectedUrls[nextUrl++];
            await processUrl(url);
        }
    }));
    if(status.state==='running'){status.discovered+=IMAGE_SOURCE_SEEDS.length;await syncImageSources(prisma,{refresh:force,onResult:async result=>{status.processed++;if(result.state==='imported')status.imported++;else if(result.state==='skipped')status.skipped++;else{status.failed++;status.errors.push({url:result.url,message:result.message||'多来源抓取失败'});}await writeStatus();}});}
    if (status.state === 'running') status.state = status.processed >= status.discovered ? (status.failed ? 'completed_with_errors' : 'completed') : 'partial';
    status.completedAt = new Date().toISOString();
    await writeStatus();
    console.log(`[Library] ${status.state}: imported=${status.imported}, skipped=${status.skipped}, failed=${status.failed}, discovered=${status.discovered}`);
}
main().catch(async error => { if (ownsLock) { status.state = 'failed'; status.errors.push({ url: 'index', message: error.message }); await writeStatus(); } console.error(error.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); if (ownsLock) await fs.unlink(lockPath).catch(() => {}); });
