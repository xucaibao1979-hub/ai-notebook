'use client';

import { useSession } from 'next-auth/react';
import { CompleteBackupPanel } from '@/components/complete-backup-panel';
import { BackupScopeInfo, SystemBackupPanel } from '@/components/system-backup-panel';

export function HistoryBackupSection() {
    const { data: session, status } = useSession();
    if (status === 'loading') return null;

    return <section aria-label="备份与恢复" className="space-y-4">
        <div>
            <h2 className="text-xl font-semibold text-slate-800">备份与恢复</h2>
            <p className="mt-1 text-sm text-slate-500">学习记录可按身份备份；管理员可下载或恢复包含题库、配置和全部家庭数据的完整系统备份。</p>
        </div>
        {session?.user?.role === 'admin' && <SystemBackupPanel />}
        <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer font-medium text-slate-800">按身份备份学习记录</summary>
            <div className="mt-4 space-y-4"><CompleteBackupPanel /><BackupScopeInfo /></div>
        </details>
    </section>;
}
