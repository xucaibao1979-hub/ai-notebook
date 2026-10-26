import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createBackup, restoreBackup, validateBackup } from '@/lib/complete-backup';
import { prisma } from '@/lib/prisma';
import { studyPreferencesSchema } from '@/lib/study-preferences';
import { hasSavedHomeworkImage } from '@/lib/homework-image';
import { learningDateKey } from '@/lib/learning';
import fs from 'fs/promises';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
export const maxDuration=300;
export async function GET(req:Request){
    const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
    const query=new URL(req.url).searchParams;
    try{
        if(query.get('status')==='1'){
            const dates=(await fs.readdir(path.resolve('data/backups')).catch(()=>[])).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
            let latest:{date:string;createdAt:string;valid:boolean;error?:string;homework?:number;revisions?:number}|null=null;
            for(const date of dates){
                const file=path.resolve('data/backups',date,session.user.id+'.json.gz');
                try{const stat=await fs.stat(file);try{const backup=validateBackup(JSON.parse(gunzipSync(await fs.readFile(file)).toString('utf8')));latest={date,createdAt:stat.mtime.toISOString(),valid:true,homework:backup.data.homework?.length||0,revisions:backup.data.revisions?.length||0};}catch(error){latest={date,createdAt:stat.mtime.toISOString(),valid:false,error:error instanceof Error?error.message:'备份校验失败'};}break;}catch{}
            }
            const [user,homeworkImages,catalogRevisions]=await Promise.all([
                prisma.user.findUnique({where:{id:session.user.id},select:{studyPreferences:true}}),
                prisma.homeworkReview.findMany({where:{userId:session.user.id},select:{image:true}}),
                prisma.studyCatalogRevision.count({where:{userId:session.user.id}}),
            ]);
            const homeworkTotal=homeworkImages.length;
            const homeworkMissingImages=homeworkImages.filter(row=>!hasSavedHomeworkImage(row.image)).length;
            let catalogValid=false;
            try{catalogValid=!!user&&studyPreferencesSchema.safeParse(JSON.parse(user.studyPreferences)).success;}catch{}
            return NextResponse.json({latest,catalogValid,homeworkTotal,homeworkMissingImages,catalogRevisions});
        }
        if(query.get('list')==='1'){
            const dates=await fs.readdir(path.resolve('data/backups')).catch(()=>[]);
            const items=[];
            for(const date of dates.filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse()) {try{const stat=await fs.stat(path.resolve('data/backups',date,session.user.id+'.json.gz'));items.push({date,bytes:stat.size});}catch{}}
            return NextResponse.json({items});
        }
        const date=query.get('date');
        const backup=date&&/^\d{4}-\d{2}-\d{2}$/.test(date)?JSON.parse(gunzipSync(await fs.readFile(path.resolve('data/backups',date,session.user.id+'.json.gz'))).toString('utf8')):await createBackup(session.user.id);
        validateBackup(backup);
        return new NextResponse(JSON.stringify(backup),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="learning-backup-${date||learningDateKey()}.json"`}});
    }catch{return NextResponse.json({message:'备份未完成，请检查磁盘空间及错题图片是否存在'},{status:500});}
}
export async function POST(req:Request){
    const session=await getServerSession(authOptions);if(!session?.user?.id)return NextResponse.json({message:'请先登录'},{status:401});
    try{
        const text=await req.text();if(Buffer.byteLength(text)>100*1024*1024)return NextResponse.json({message:'备份超过 100MB，请使用本地数据库备份恢复'},{status:413});
        const body=JSON.parse(text);
        if(body.action==='verify-current'){
            const backup=await createBackup(session.user.id);
            const counts=await restoreBackup(backup,session.user.id,true);
            return NextResponse.json({success:true,checkedAt:new Date().toISOString(),counts});
        }
        if(body.action!=='preview'&&body.action!=='restore')throw new Error('请选择校验或恢复');
        await restoreBackup(body.backup,session.user.id,true);
        // Always capture current account before applying a restore.
        if(body.action==='restore'){const dir=path.resolve('data/backups/before-restore');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,Date.now()+'-'+session.user.id+'.json.gz'),gzipSync(JSON.stringify(await createBackup(session.user.id))));}
        const counts=await restoreBackup(body.backup,session.user.id,body.action==='preview');
        return NextResponse.json({success:true,counts});
    }catch(e){return NextResponse.json({message:e instanceof Error?e.message:'备份恢复失败'},{status:400});}
}
