import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {homeworkResultSchema} from './homework';
import { z } from 'zod';
import { studyPreferencesSchema } from './study-preferences';

const row = z.record(z.string(), z.unknown());
const dataSchema = z.object({
    profile: z.object({ name: z.string().nullable(), educationStage: z.string().nullable(), enrollmentYear: z.number().nullable(), currentGrade: z.number().int().min(1).max(17).nullable(), examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}).nullable(), studyPreferences: z.string() }),
    subjects: z.array(row), tags: z.array(row), errors: z.array(row), schedules: z.array(row),
    sets: z.array(row), records: z.array(row), reports: z.array(row), attempts: z.array(row), papers: z.array(row), homework:z.array(row).optional(), revisions:z.array(row).optional(),
    assets: z.array(z.object({ url: z.string(), data: z.string(), sha256: z.string() })),
});
const envelope = z.object({ version: z.literal(2), kind: z.literal('learning-backup'), exportedAt: z.string(), email: z.string(), sha256: z.string(), data: dataSchema });
const checksum = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function validateBackup(raw: unknown) {
    const backup = envelope.parse(raw);
    if (checksum(JSON.stringify(backup.data)) !== backup.sha256) throw new Error('备份校验失败：文件内容已改变或不完整');
    studyPreferencesSchema.parse(JSON.parse(backup.data.profile.studyPreferences));
    for (const asset of backup.data.assets) {
        if (!/^\/(?:uploads|knowledge-assets)\/[\w./-]+$/.test(asset.url) || asset.url.includes('..')) throw new Error('备份包含非法图片路径');
        if (checksum(Buffer.from(asset.data, 'base64')) !== asset.sha256) throw new Error('图片校验失败');
    }
    for (const name of ['subjects', 'tags', 'errors', 'schedules', 'sets', 'records', 'reports', 'attempts', 'papers', 'homework', 'revisions'] as const) {
        const ids = new Set<string>();
        for (const item of backup.data[name]||[]) {
            if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error(`${name} 存在无效或重复 ID`);
            ids.add(item.id);
        }
    }
    const has = (table: keyof typeof backup.data, id: unknown) => !id || (backup.data[table] as Record<string, unknown>[]).some(r => r.id === id);
    for (const e of backup.data.errors) if (!has('subjects', e.subjectId)) throw new Error('错题本关联缺失');
    for (const r of backup.data.records) if (!has('sets', r.learningSetId)) throw new Error('练习题组关联缺失');
    for (const s of backup.data.schedules) if (!has('errors', s.errorItemId)) throw new Error('复习错题关联缺失');
    for (const a of backup.data.attempts) if (!has('papers', a.paperId)) throw new Error('试卷关联缺失');
    for (const t of backup.data.tags) if (!has('tags', t.parentId)) throw new Error('知识点父级关联缺失');
    for (const t of backup.data.tags) {const visited=new Set();let cursor:Record<string,unknown>|undefined=t;while(cursor){if(visited.has(cursor.id))throw new Error('知识点层级存在循环');visited.add(cursor.id);cursor=backup.data.tags.find(next=>next.id===cursor?.parentId);}}
    for (const e of backup.data.errors) if(Array.isArray(e.tags)&&e.tags.some(t=>!has('tags',(t as {id:string}).id))) throw new Error('错题知识点关联缺失');
    for (const r of backup.data.reports) if(!has('subjects',r.notebookId)||!has('sets',r.exerciseSetId)) throw new Error('周报关联缺失');
    for(const h of backup.data.homework||[])homeworkResultSchema.parse({questions:JSON.parse(String(h.questions))});
    for(const revision of backup.data.revisions||[]) {
        if(typeof revision.action!=='string'||typeof revision.snapshot!=='string') throw new Error('目录历史版本格式无效');
        studyPreferencesSchema.parse(JSON.parse(revision.snapshot));
    }
    for (const s of backup.data.sets) {
        const questions = JSON.parse(String(s.questions));
        if (!Array.isArray(questions)) throw new Error('练习题目格式无效');
        for (const field of ['favoriteIndices','deletedIndices']) {
            const values = JSON.parse(String(s[field] || '[]'));
            if (!Array.isArray(values) || values.some(i => !Number.isInteger(i) || i < 0 || i >= questions.length)) throw new Error('练习索引无效');
        }
    }
    for(const r of backup.data.records)if(r.learningSetId){const set=backup.data.sets.find(s=>s.id===r.learningSetId)!;if(!Number.isInteger(r.exerciseIndex)||Number(r.exerciseIndex)<0||Number(r.exerciseIndex)>=JSON.parse(String(set.questions)).length)throw new Error('作答题号关联无效');}
    for (const p of backup.data.papers) if (!Array.isArray(JSON.parse(String(p.questions)))) throw new Error('试卷格式无效');
    return backup;
}
export async function createBackup(userId: string) {
    const data = await prisma.$transaction(async tx => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        const subjects = await tx.subject.findMany({ where: { userId } });
        const errors = await tx.errorItem.findMany({ where: { userId }, include: { tags: true } });
        const tags = await tx.knowledgeTag.findMany({ where: { OR: [{userId}, {isSystem:true}] } });
        const schedules = await tx.reviewSchedule.findMany({ where: { errorItem: { userId } } });
        const sets = await tx.learningSet.findMany({ where: { userId } });
        const records = await tx.practiceRecord.findMany({ where: { userId } });
        const reports = await tx.weeklyReport.findMany({ where: { userId } });
        const attempts = await tx.paperAttempt.findMany({ where: { userId } });
        const papers = await tx.knowledgePaper.findMany({ where: { id: { in: attempts.map(a => a.paperId) } } });
        const homework=await tx.homeworkReview.findMany({where:{userId}});
        const revisions=await tx.studyCatalogRevision.findMany({where:{userId},orderBy:{createdAt:'asc'}});
        return { email: user.email, profile: { name: user.name, educationStage: user.educationStage, enrollmentYear: user.enrollmentYear, currentGrade: user.currentGrade, examDate: user.examDate, studyPreferences: user.studyPreferences }, subjects, tags, errors, schedules, sets, records, reports, attempts, papers, homework, revisions };
    }, {timeout: 60000});
    const assets: {url:string;data:string;sha256:string}[] = [];
    const paperImages=[...data.papers,...data.sets].flatMap(p=>[...p.questions.matchAll(/\/(?:knowledge-assets\/[a-f0-9]{64}|uploads\/restore-[a-f0-9]{64})\.(?:jpg|png|webp)/g)].map(m=>m[0]));
    for (const url of new Set([...data.errors.map(e => e.originalImageUrl).filter(url => url.startsWith('/uploads/')), ...paperImages])) {
        if (!/^\/(?:uploads|knowledge-assets)\/[\w./-]+$/.test(url) || url.includes('..')) throw new Error('图片路径异常');
        const bytes = await fs.readFile(path.join(process.cwd(), 'public', url));
        assets.push({url,data:bytes.toString('base64'),sha256:checksum(bytes)});
    }
    const {email,...rest}=data;
    const payload = JSON.parse(JSON.stringify({...rest,assets}));
    return {version:2,kind:'learning-backup',exportedAt:new Date().toISOString(),email,sha256:checksum(JSON.stringify(payload)),data:payload};
}
// Scalar allowlist also validates primitive types and dates before any database writes.
function scalarData(modelName: string, input: Record<string, unknown>): Record<string, unknown> {
    const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)!;
    const result: Record<string, unknown> = {};
    for (const f of model.fields.filter(f => f.kind !== 'object' && f.name !== 'id')) {
        const value = input[f.name];
        if (value === undefined) {if(f.isRequired&&!f.hasDefaultValue&&!f.isUpdatedAt)throw new Error(`${modelName}.${f.name} 缺失`);continue;}
        if (value === null) { if (f.isRequired) throw new Error(`${modelName}.${f.name} 不能为空`); result[f.name]=null; continue; }
        if (f.type === 'DateTime') { const d = new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error('日期无效'); result[f.name]=d; }
        else if ((f.type==='String' && typeof value!=='string') || (f.type==='Boolean' && typeof value!=='boolean') || (f.type==='Int' && !Number.isInteger(value))) throw new Error(`${modelName}.${f.name} 格式无效`);
        else result[f.name]=value;
    }
    return result;
}
export async function restoreBackup(raw: unknown, userId: string, dryRun = false) {
    const backup=validateBackup(raw);
    const current=await prisma.user.findUniqueOrThrow({where:{id:userId}});
    if(backup.email!==current.email) throw new Error('请使用备份所属账户登录后恢复');
    const counts=Object.fromEntries(Object.entries(backup.data).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,(v as unknown[]).length]));
    // Prevalidate every scalar before transaction, also in preview mode.
    const models={subjects:'Subject',tags:'KnowledgeTag',errors:'ErrorItem',schedules:'ReviewSchedule',sets:'LearningSet',records:'PracticeRecord',reports:'WeeklyReport',attempts:'PaperAttempt',papers:'KnowledgePaper',homework:'HomeworkReview',revisions:'StudyCatalogRevision'};
    for(const [table,model] of Object.entries(models)) for(const item of backup.data[table as keyof typeof models]||[]) scalarData(model,item);
    if(dryRun)return counts;
    const {sanitizeHtml}=await import('../../scripts/library-parser.cjs');
    for(const table of [backup.data.sets,backup.data.papers])for(const item of table){const questions=JSON.parse(String(item.questions)) as Record<string,unknown>[];for(const q of questions)for(const key of ['questionHtml','answerHtml','originalQuestionHtml'])if(typeof q[key]==='string')q[key]=sanitizeHtml(q[key] as string,String(item.sourceUrl||'https://kaosj.com/'));item.questions=JSON.stringify(questions);}
    const ids=new Map<string,string>();
    const mapped=(id:unknown)=>id?ids.get(String(id)) || null:null;
    const restoreId=(id:unknown)=>'restored_'+checksum(userId+':'+String(id)).slice(0,32);
    // Content-addressed copies are written first, so a failed transaction never damages current images.
    const imageUrls=new Map<string,string>();
    for(const a of backup.data.assets){const suffix=path.extname(a.url).toLowerCase();const url='/uploads/restore-'+a.sha256+(/^(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/.test(suffix)?suffix:'.bin');const target=path.join(process.cwd(),'public',url);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,Buffer.from(a.data,'base64'));imageUrls.set(a.url,url);}
    for(const table of [backup.data.sets,backup.data.papers])for(const item of table)for(const [oldUrl,newUrl] of imageUrls)item.questions=String(item.questions).replaceAll(oldUrl,newUrl);
    await prisma.$transaction(async tx=>{
        for(const item of backup.data.revisions||[]){const id=restoreId(item.id);const existing=await tx.studyCatalogRevision.findFirst({where:{userId,id:{in:[String(item.id),id]}}});if(!existing)await tx.studyCatalogRevision.create({data:{...scalarData('StudyCatalogRevision',item),id,userId} as Prisma.StudyCatalogRevisionUncheckedCreateInput});}
        for(const item of backup.data.homework||[]){const own=await tx.homeworkReview.findFirst({where:{id:String(item.id),userId}});const id=own?.id||restoreId(item.id);const data={...scalarData('HomeworkReview',item),userId} as Prisma.HomeworkReviewUncheckedCreateInput;await tx.homeworkReview.upsert({where:{id},create:{...data,id},update:data});ids.set(String(item.id),id);}
        for(const item of backup.data.subjects){const data=scalarData('Subject',item);const existing=await tx.subject.findFirst({where:{userId,name:String(item.name)}});const id=existing?.id || restoreId(item.id);await tx.subject.upsert({where:{id},create:{...data,id,userId} as Prisma.SubjectUncheckedCreateInput,update:{name:String(item.name)}});ids.set(String(item.id),id);}
        for(const item of backup.data.tags){const existing=await tx.knowledgeTag.findFirst({where:{name:String(item.name),subject:String(item.subject),...(item.isSystem?{isSystem:true}:{userId})}});const id=existing?.id || restoreId(item.id);if(!existing)await tx.knowledgeTag.create({data:{...scalarData('KnowledgeTag',item),id,userId,isSystem:false,parentId:null} as Prisma.KnowledgeTagUncheckedCreateInput});ids.set(String(item.id),id);}
        for(const item of backup.data.tags)if(item.parentId&&!item.isSystem)await tx.knowledgeTag.updateMany({where:{id:mapped(item.id)!,userId},data:{parentId:mapped(item.parentId)}});
        for(const item of backup.data.errors){const existing=await tx.errorItem.findFirst({where:{userId,id:{in:[String(item.id),restoreId(item.id)]}}});const id=existing?.id||restoreId(item.id);const data={...scalarData('ErrorItem',item),userId,subjectId:mapped(item.subjectId),originalImageUrl:imageUrls.get(String(item.originalImageUrl))||String(item.originalImageUrl||'')} as Prisma.ErrorItemUncheckedCreateInput;await tx.errorItem.upsert({where:{id},create:{...data,id},update:data});const tags=Array.isArray(item.tags)?item.tags as {id:string}[]:[];await tx.errorItem.update({where:{id},data:{tags:{set:tags.map(t=>mapped(t.id)).filter(Boolean).map(id=>({id:id!}))}}});ids.set(String(item.id),id);}
        for(const item of backup.data.papers){let existing=await tx.knowledgePaper.findUnique({where:{sourceUrl:String(item.sourceUrl)}});let sourceUrl=String(item.sourceUrl);if(existing&&existing.questions!==String(item.questions)){sourceUrl=sourceUrl.split('#')[0]+'#backup-'+checksum(String(item.questions)).slice(0,16);existing=await tx.knowledgePaper.findUnique({where:{sourceUrl}});}const id=existing?.id||restoreId(String(item.id)+':'+sourceUrl);if(!existing)await tx.knowledgePaper.create({data:{...scalarData('KnowledgePaper',item),id,sourceUrl} as Prisma.KnowledgePaperUncheckedCreateInput});ids.set(String(item.id),id);}
        for(const item of backup.data.sets){const own=await tx.learningSet.findFirst({where:{userId,id:String(item.id)}});const unique= item.dateKey?await tx.learningSet.findUnique({where:{userId_dateKey_selectionKey:{userId,dateKey:String(item.dateKey),selectionKey:String(item.selectionKey)}}}):null;const id=own?.id||unique?.id||restoreId(item.id);const questions=(JSON.parse(String(item.questions)) as {provenance?:{originalId?:string;url?:string}}[]).map(q=>{const original=mapped(q.provenance?.originalId);return original?{...q,provenance:{...q.provenance,originalId:original,url:'/error-items/'+original}}:q;});const data={...scalarData('LearningSet',item),userId,questions:JSON.stringify(questions)} as Prisma.LearningSetUncheckedCreateInput;await tx.learningSet.upsert({where:{id},create:{...data,id},update:data});ids.set(String(item.id),id);}
        for(const item of backup.data.errors){const homework=String(item.source||'').match(/^(homework|homework-manual):([^:]+):(.+)$/);if(homework&&mapped(homework[2]))await tx.errorItem.updateMany({where:{id:mapped(item.id)!,userId},data:{source:homework[1]+':'+mapped(homework[2])+':'+homework[3]}});const match=String(item.source||'').match(/^(练习回流|试卷回流):([^:]+):(.+)$/);if(match&&mapped(match[2]))await tx.errorItem.updateMany({where:{id:mapped(item.id)!,userId},data:{source:match[1]+':'+mapped(match[2])+':'+match[3]}});}
        for(const item of backup.data.records){const own=await tx.practiceRecord.findFirst({where:{id:String(item.id),userId}});const id=own?.id||restoreId(item.id);const data={...scalarData('PracticeRecord',item),userId,learningSetId:mapped(item.learningSetId)} as Prisma.PracticeRecordUncheckedCreateInput;if(data.learningSetId&&data.exerciseIndex!==null&&data.exerciseIndex!==undefined){await tx.practiceRecord.upsert({where:{userId_learningSetId_exerciseIndex:{userId,learningSetId:data.learningSetId,exerciseIndex:data.exerciseIndex}},create:{...data,id},update:data});}else await tx.practiceRecord.upsert({where:{id},create:{...data,id},update:data});}
        for(const item of backup.data.schedules){const own=await tx.reviewSchedule.findFirst({where:{id:String(item.id),errorItem:{userId}}});const id=own?.id||restoreId(item.id);const data={...scalarData('ReviewSchedule',item),errorItemId:mapped(item.errorItemId)!} as Prisma.ReviewScheduleUncheckedCreateInput;await tx.reviewSchedule.upsert({where:{id},create:{...data,id},update:data});}
        for(const item of backup.data.reports){const data={...scalarData('WeeklyReport',item),userId,notebookId:mapped(item.notebookId),notebookKey:mapped(item.notebookId)||'all',exerciseSetId:mapped(item.exerciseSetId),leaseUntil:null} as Prisma.WeeklyReportUncheckedCreateInput;await tx.weeklyReport.upsert({where:{userId_notebookKey_weekKey:{userId,notebookKey:data.notebookKey,weekKey:data.weekKey}},create:{...data,id:restoreId(item.id)},update:data});}
        for(const item of backup.data.attempts){const own=await tx.paperAttempt.findFirst({where:{id:String(item.id),userId}});const id=own?.id||restoreId(item.id);const data={...scalarData('PaperAttempt',item),userId,paperId:mapped(item.paperId)!} as Prisma.PaperAttemptUncheckedCreateInput;await tx.paperAttempt.upsert({where:{id},create:{...data,id},update:data});}
        await tx.user.update({where:{id:userId},data:backup.data.profile});
    },{timeout:120000});
    return counts;
}

