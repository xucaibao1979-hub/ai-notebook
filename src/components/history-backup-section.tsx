'use client';

import { useSession } from 'next-auth/react';
import { SystemBackupPanel } from '@/components/system-backup-panel';

export function HistoryBackupSection() {
    const { data: session, status } = useSession();
    if (status === 'loading') return null;

    return <section aria-label="备份与恢复" className="space-y-4">
        <div>
            <h2 className="text-xl font-semibold text-slate-800">备份与恢复</h2>
            <p className="mt-1 text-sm text-slate-500">导出加密备份，或使用原密码恢复全部配置与学习数据。</p>
        </div>
        {session?.user?.role === 'admin' && <SystemBackupPanel />}
        {session?.user?.role !== 'admin' && <p className="text-sm text-slate-500">备份与恢复仅供管理员使用。</p>}
    </section>;
}
