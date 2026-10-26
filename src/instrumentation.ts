
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { setupGlobalProxy } = await import('./lib/global-proxy');
        setupGlobalProxy();
        if (process.env.NEXT_PHASE !== 'phase-production-build' && process.env.NODE_ENV !== 'test') {
            const { startWeeklyScheduler } = await import('./lib/weekly-scheduler');
            startWeeklyScheduler();
            const { startBackupScheduler } = await import('./lib/backup-scheduler');
            startBackupScheduler();
        }
    }
}
