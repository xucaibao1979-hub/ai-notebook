import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient, ApiError, friendlyApiError } from '@/lib/api-client';
afterEach(() => { vi.unstubAllGlobals(); });
describe('network recovery and Chinese messages', () => {
    it('recovers transient read failures without showing a generic network error', async () => {
        const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        expect(await apiClient.get('/api/test')).toEqual({ ok: true });
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('never retries an AI generation mutation automatically', async () => {
        const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')); vi.stubGlobal('fetch', fetch);
        await expect(apiClient.post('/api/generate', {})).rejects.toBeInstanceOf(ApiError);
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('reads a non-JSON error body once and reports format problems', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>error</html>', { status: 500 })));
        await expect(apiClient.post('/api/test', {})).rejects.toMatchObject({ status: 500 });
    });
    it('distinguishes sign-in, timeout and model connection failures in Chinese', () => {
        expect(friendlyApiError(new ApiError(401, '', {}))).toContain('重新登录');
        expect(friendlyApiError(new ApiError(408, '', {}))).toContain('避免重复提交');
        expect(friendlyApiError(new ApiError(502, '', { message: 'AI_CONNECTION_FAILED' }))).toContain('大模型服务');
    });
});
