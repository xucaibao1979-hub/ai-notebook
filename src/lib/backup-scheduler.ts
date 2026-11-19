import fs from 'fs/promises';
import path from 'path';
import { gzipSync } from 'zlib';
import { createHash } from 'crypto';
import { prisma } from './prisma';
import { createBackup } from './complete-backup';
import { learningDateKey } from './learning';
const state = globalThis as typeof globalThis & { backupTimer?:ReturnType<typeof setInterval>; backupRunning?:boolean };
export async function runAutomaticBackup() {
    if(state.backupRunning)return;
    state.backupRunning=true;
    try {
        const date=learningDateKey();
        const folder=path.resolve('data/backups',date);
        await fs.mkdir(folder,{recursive:true});
        const configBackup=path.join(folder,'system-config.json.gz');
        if(!await fs.stat(configBackup).catch(()=>null)){
            const files:Record<string,string>={};
            for(const relative of ['.env','config/app-config.json']){
                const contents=await fs.readFile(path.resolve(relative)).catch(()=>null);
                if(contents)files[relative]=contents.toString('base64');
            }
            const payload={kind:'system-config-backup',version:1,createdAt:new Date().toISOString(),files};
            const sha256=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
            await fs.writeFile(configBackup+'.tmp',gzipSync(JSON.stringify({...payload,sha256})));
            await fs.rename(configBackup+'.tmp',configBackup);
        }
        const snapshot=path.join(folder,'database.sqlite');
        const temporary=path.join(folder,`database-${Date.now()}.sqlite`);
        await prisma.$executeRawUnsafe(`VACUUM INTO '${temporary.replaceAll('\\','/').replaceAll("'","''")}'`);
        await fs.rename(temporary,snapshot);
        const users=await prisma.user.findMany({select:{id:true}});
        const hour = new Date().toISOString().slice(11, 13);
        for(const user of users){
            const file=path.join(folder,user.id+'.json.gz');
            const backup=await createBackup(user.id);
            const contents=gzipSync(JSON.stringify(backup));
            await fs.writeFile(file+'.tmp',contents);
            await fs.rename(file+'.tmp',file);
            // The daily backup is refreshed in place. Keep hourly catalog copies so a
            // later accidental deletion cannot erase the only independent copy.
            const catalogFile=path.join(folder,`${user.id}-catalog-${hour}.json.gz`);
            const catalog={ exportedAt: backup.exportedAt, email: backup.email, studyPreferences: backup.data.profile.studyPreferences };
            await fs.writeFile(catalogFile+'.tmp',gzipSync(JSON.stringify(catalog)));
            await fs.rename(catalogFile+'.tmp',catalogFile);
        }
    } finally {state.backupRunning=false;}
}
export function startBackupScheduler(){
    if(state.backupTimer)return;
    const tick=()=>runAutomaticBackup().catch(e=>console.error('[backup] 自动备份失败',e instanceof Error?e.message:'未知错误'));
    state.backupTimer=setInterval(tick,3600000);state.backupTimer.unref?.();
    const startup=setTimeout(tick,60000);startup.unref?.();
}
