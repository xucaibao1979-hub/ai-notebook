import { afterEach, expect, it, vi } from 'vitest';
import { pendingLearningTask, resumeLearningTask, retryLearningTask } from '@/lib/learning-stream';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

it('marks a failed daily task so opening the page does not resume it again, while keeping manual retry', async () => {
    localStorage.setItem('learning-task-daily', JSON.stringify({ id: 'task-1' }));
    const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'failed', error: '模型不可用' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'task-1' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'succeeded', result: { id: 'set-1' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(resumeLearningTask('task-1', 'daily', () => {})).rejects.toThrow('模型不可用');
    expect(pendingLearningTask('daily')).toEqual({ id: 'task-1', failed: true });
    await expect(retryLearningTask('daily', () => {})).resolves.toEqual({ id: 'set-1' });
    expect(pendingLearningTask('daily')).toBeNull();
});
