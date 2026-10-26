import { runWeeklySweep } from './weekly-report-service';

const state = globalThis as typeof globalThis & { weeklyAnalysisTimer?: ReturnType<typeof setInterval>; weeklyAnalysisRunning?: boolean };
export function startWeeklyScheduler() {
    if (state.weeklyAnalysisTimer) return;
    const tick = async () => {
        if (state.weeklyAnalysisRunning) return;
        state.weeklyAnalysisRunning = true;
        try { await runWeeklySweep(); }
        catch (error) { console.error('[weekly-scheduler] Failed to check weekly reports', error instanceof Error ? error.message : 'Unknown error'); }
        finally { state.weeklyAnalysisRunning = false; }
    };
    state.weeklyAnalysisTimer = setInterval(tick, 3600000);
    state.weeklyAnalysisTimer.unref?.();
    const startup = setTimeout(tick, 30000);
    startup.unref?.();
}
