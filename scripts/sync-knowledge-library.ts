import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {syncImageSources,IMAGE_SOURCE_SEEDS,discoverImageSources} from './sync-image-sources';
import { inferPaperMetadata, inferKnowledgeGrade, RECENT_EXAM_YEARS } from '../src/lib/knowledge-library';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePaperHtml } = require('./library-parser.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
const prisma = new PrismaClient();
const directory = path.join(process.cwd(), 'data', 'knowledge-library');
const imageOnly = process.argv.includes('--image-only');
const cacheOnly = process.argv.includes('--cache-only');
const progressFile = path.join(directory, imageOnly ? 'image-sync-status.json' : cacheOnly ? 'cache-sync-status.json' : 'sync-status.json');
const lockPath = path.join(directory, 'sync.lock');
let ownsLock = false;
const status = { state: 'running', startedAt: new Date().toISOString(), completedAt: '', retryAt: '', discovered: 0, imported: 0, skipped: 0, failed: 0, processed: 0, resumed: 0, checkedIndexes: 0, pendingCandidates: 0, completedUrls: [] as string[], years: RECENT_EXAM_YEARS, errors: [] as { url: string; message: string }[], coverage: '公开目录范围；不代表全国所有原卷均已收录。来源年份、答案与题干质量尚待核验。' };
let lastRequest = 0;
class SourceResponseError extends Error {
    constructor(readonly code: number, readonly retryAt?: string) { super(`HTTP ${code}`); }
}
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
    const scheduledAt = Math.max(Date.now(), lastRequest + 3000);
    lastRequest = scheduledAt;
    const wait = scheduledAt - Date.now();
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'WrongNotebookPersonalStudy/1.0 (+local-archive)', Accept: 'text/html,application/xml' } });
    if (!response.ok) throw new SourceResponseError(response.status, response.headers.get('retry-after') || undefined);
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
    const resume = process.argv.includes('--resume') && !cacheOnly;
    type PreviousStatus = { processed?: number; discovered?: number; failed?: number; errors?: {url:string}[]; completedUrls?: string[] };
    let legacyStatus: PreviousStatus | null = null;
    let previousManifest: { urls?: string[] } | null = null;
    if (resume) {
        try {
            const previous = JSON.parse(await fs.readFile(progressFile, 'utf8')) as PreviousStatus;
            if (Array.isArray(previous?.completedUrls)) status.completedUrls = previous.completedUrls.filter((url): url is string => typeof url === 'string');
            else legacyStatus = previous;
            try { previousManifest = JSON.parse(await fs.readFile(path.join(directory, 'source-manifest.json'), 'utf8')); } catch { /* No earlier manifest. */ }
        } catch { /* First run starts without a checkpoint. */ }
    }
    if (imageOnly) {
        await writeStatus();
        const discovery=await discoverImageSources();
        status.checkedIndexes=discovery.indexCount;
        for(const error of discovery.errors){status.failed++;status.errors.push(error);}
        status.completedUrls = status.completedUrls.filter(url => discovery.seeds.some(seed => seed.url === url));
        status.resumed = status.completedUrls.length;
        status.processed = status.resumed;
        status.discovered = discovery.seeds.length;
        status.pendingCandidates = discovery.seeds.filter(seed => !status.completedUrls.includes(seed.url)).length;
        await writeStatus();
        await syncImageSources(prisma, { seeds: discovery.seeds, skipUrls: resume ? new Set(status.completedUrls) : undefined, onResult: async result => {
            if (result.state === 'imported' || result.state === 'skipped') {
                status.completedUrls.push(result.url);
                status.processed++;
                if (result.state === 'imported') status.imported++; else status.skipped++;
            } else {
                status.failed++;
                status.errors.push({ url: result.url, message: result.message || '多来源抓取失败' });
            }
            status.pendingCandidates=Math.max(0,status.discovered-status.processed);
            await writeStatus();
        } });
        status.state = status.failed ? 'completed_with_errors' : 'completed';
        status.completedAt = new Date().toISOString();
        await writeStatus();
        return;
    }
    await writeStatus();
    const sitemapPath = path.join(directory, 'source-sitemap.xml');
    let xml: string;
    if (cacheOnly) xml = await fs.readFile(sitemapPath, 'utf8');
    else try { xml = await fetchText('https://kaosj.com/sitemap.xml'); await fs.writeFile(sitemapPath, xml); }
    catch { xml = await fs.readFile(sitemapPath, 'utf8'); }
    const document: Document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
    const urls = [...new Set([...document.querySelectorAll('loc')].map(loc => loc.textContent || '').filter(url => /^https:\/\/kaosj\.com\/papers\/202[2-6]\//.test(url)))];
    await fs.writeFile(path.join(directory, 'source-manifest.json'), JSON.stringify({ source: 'https://kaosj.com/sitemap.xml', discoveredAt: new Date().toISOString(), urls }, null, 2));
    const force = process.argv.includes('--refresh');
    const reparseCache = process.argv.includes('--reparse-cache');
    const limitIndex = process.argv.indexOf('--limit');
    const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : urls.length;
    const ordered = urls.sort((a, b) => b.localeCompare(a));
    const selectedUrls = ordered.slice(0, limit);
    if (cacheOnly) console.log('[Library] Reparse local cache only; no source network requests.');
    status.discovered = selectedUrls.length + (cacheOnly ? 0 : IMAGE_SOURCE_SEEDS.length);
    if (legacyStatus && previousManifest?.urls && legacyStatus.discovered === previousManifest.urls.length && legacyStatus.processed && legacyStatus.processed > 0 && previousManifest.urls.every(url=>urls.includes(url))) {
        const previousOrder = [...new Set(previousManifest.urls)].sort((a,b)=>b.localeCompare(a));
        const failed = new Set(legacyStatus.errors?.map(item=>item.url) || []);
        // Older status had no per-URL checkpoint: preserve only the confirmed prefix.
        const firstFailure = previousOrder.findIndex(url=>failed.has(url));
        const safePrefix = Math.min(legacyStatus.processed - (legacyStatus.failed || 0), firstFailure < 0 ? previousOrder.length : firstFailure);
        status.completedUrls = previousOrder.slice(0, Math.max(0, safePrefix));
    }
    const previouslyCompleted = new Set(status.completedUrls);
    status.completedUrls = [...previouslyCompleted].filter(url => selectedUrls.includes(url) || IMAGE_SOURCE_SEEDS.some(seed => seed.url === url));
    const confirmedCompleted = new Set(status.completedUrls);
    status.resumed = status.completedUrls.length;
    status.processed = status.resumed;
    await writeStatus();
    let nextUrl = 0;
    async function processUrl(url: string) {
        let succeeded = false;
        try {
            if (!force && !reparseCache && !cacheOnly && await prisma.knowledgePaper.findUnique({ where: { sourceUrl: url }, select: { id: true } })) { status.skipped++; succeeded = true; return; }
            const rawPath = path.join(directory, 'raw', `${createHash('sha256').update(url).digest('hex')}.html`);
            if (cacheOnly) {
                try { await fs.access(rawPath); } catch { status.skipped++; succeeded = true; return; }
            }
            const html = reparseCache || cacheOnly ? await fs.readFile(rawPath, 'utf8') : await fetchText(url);
            const parsed = parsePaperHtml(html, url) as { title: string; questions: { number: string; questionHtml: string; questionText: string; answerHtml: string; answerLeakRisk: boolean; wholePaper?: boolean }[]; attachments: object[] };
            const meta = inferPaperMetadata(parsed.title);
            if (/韩国|日本|英国|美国|新加坡|澳大利亚/.test(parsed.title)) {
                await prisma.knowledgePaper.deleteMany({ where: { sourceUrl: url, sourceName: '考试卷网 · 公开整理版' } });
                status.skipped++;
                succeeded = true;
                return;
            }
            if (!RECENT_EXAM_YEARS.includes(meta.year) || !meta.examType || !meta.subject || /模拟|一模|二模|三模|月考|期中|期末/.test(parsed.title)) { status.skipped++; succeeded = true; return; }
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
            succeeded = true;
        } catch (error) {
            status.failed++;
            status.errors.push({ url, message: error instanceof Error ? error.message : '未知错误' });
            if (error instanceof SourceResponseError && error.code === 403) status.state = 'access_denied';
            if (error instanceof SourceResponseError && error.code === 429) {
                status.state = 'rate_limited';
                if (error.retryAt) {
                    const seconds = /^\d+$/.test(error.retryAt) ? Number(error.retryAt) : NaN;
                    const retryDate = Number.isFinite(seconds) && seconds <= 86400 ? new Date(Date.now() + seconds * 1000) : new Date(error.retryAt);
                    if (Number.isFinite(retryDate.getTime()) && retryDate.getTime() > Date.now()) status.retryAt = retryDate.toISOString();
                    status.errors[status.errors.length - 1].message += `；来源建议稍后重试（Retry-After: ${error.retryAt.slice(0, 80)}）`;
                }
            }
        } finally {
            if (succeeded) { status.completedUrls.push(url); status.processed++; }
            await writeStatus();
            if (status.processed % 10 === 0) console.log(`[Library] ${status.processed}/${status.discovered}, imported=${status.imported}, skipped=${status.skipped}, failed=${status.failed}`);
        }
    }
    // One request at a time; stop promptly if the source denies access or asks us to slow down.
    while (nextUrl < selectedUrls.length && status.state === 'running') {
        const url = selectedUrls[nextUrl++];
        if (confirmedCompleted.has(url)) continue;
        await processUrl(url);
    }
    // Each source is independent: blocking one host must not prevent other permitted sources.
    if (!cacheOnly) await syncImageSources(prisma,{refresh:force,skipUrls:resume?new Set(status.completedUrls):undefined,shouldStop:()=>false,onResult:async result=>{if(result.state==='imported'||result.state==='skipped'){status.completedUrls.push(result.url);status.processed++;if(result.state==='imported')status.imported++;else status.skipped++;}else{status.failed++;status.errors.push({url:result.url,message:result.message||'多来源抓取失败'});/* A different host's error does not change the primary source status. */}await writeStatus();}});
    if (status.state === 'running') status.state = status.processed >= status.discovered ? (status.failed ? 'completed_with_errors' : 'completed') : 'partial';
    status.completedAt = new Date().toISOString();
    await writeStatus();
    console.log(`[Library] ${status.state}: imported=${status.imported}, skipped=${status.skipped}, failed=${status.failed}, discovered=${status.discovered}`);
}
main().catch(async error => { if (ownsLock) { status.state = 'failed'; status.errors.push({ url: 'index', message: error.message }); await writeStatus(); } console.error(error.message); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); if (ownsLock) await fs.unlink(lockPath).catch(() => {}); });
