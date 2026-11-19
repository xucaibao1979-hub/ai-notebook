import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
    createLogger: () => ({ error: vi.fn() }),
}));
const mockSession = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => mockSession(...args) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { POST } from '@/app/api/ai/models/route';

function makeRequest(body: unknown, query = ''): NextRequest {
    return new NextRequest(`http://localhost/api/ai/models${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function upstream(data: unknown): Response {
    return new Response(JSON.stringify(data), { status: 200 });
}

describe('POST /api/ai/models', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSession.mockResolvedValue({ user: { id: 'owner', role: 'user' } });
    });

    it('匿名用户不能代请求上游', async () => {
        mockSession.mockResolvedValue(null);
        expect((await POST(makeRequest({ provider: 'openai', apiKey: 'secret' }))).status).toBe(401);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it.each(['http://127.0.0.1:8080', 'https://localhost', 'https://10.0.0.1', 'https://api.openai.com.evil.example/v1', 'https://api.openai.com/v1/../internal'])('普通用户不能代请求私有或伪造地址 %s', async baseUrl => {
        const response = await POST(makeRequest({ provider: 'openai', apiKey: 'secret', baseUrl }));
        expect(response.status).toBe(403);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('管理员也不能代请求未列入预设的自定义地址', async () => {
        mockSession.mockResolvedValue({ user: { id: 'owner', role: 'admin' } });
        const response = await POST(makeRequest({ provider: 'gemini', apiKey: 'secret', baseUrl: 'https://custom.example.com' }));
        expect(response.status).toBe(403);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('管理员可请求官方 OpenAI 模型，密钥不进入任何 URL', async () => {
        mockSession.mockResolvedValue({ user: { id: 'owner', role: 'admin' } });
        mockFetch.mockResolvedValueOnce(upstream({ data: [{ id: 'gpt-4o', owned_by: 'openai' }] }));
        const request = makeRequest({ provider: 'openai', apiKey: 'very-secret', baseUrl: 'https://api.openai.com/v1' });
        expect(request.url).not.toContain('very-secret');
        const response = await POST(request);
        expect((await response.json()).models).toEqual([{ id: 'gpt-4o', name: 'gpt-4o', owned_by: 'openai' }]);
        expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
            redirect: 'error', signal: expect.any(AbortSignal), headers: expect.objectContaining({ Authorization: 'Bearer very-secret' }),
        }));
        expect(mockFetch.mock.calls[0][0]).not.toContain('very-secret');
    });

    it('普通用户可使用内置预设获取模型', async () => {
        mockFetch.mockResolvedValueOnce(upstream({ data: [{ id: 'qwen-plus' }] }));
        const response = await POST(makeRequest({ provider: 'openai', apiKey: 'secret', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' }));
        expect((await response.json()).models[0].id).toBe('qwen-plus');
        expect(mockFetch.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models');
    });

    it('Claude 预设使用官方兼容地址获取模型列表', async () => {
        mockFetch.mockResolvedValueOnce(upstream({ data: [{ id: 'claude-sonnet' }] }));
        const response = await POST(makeRequest({ provider: 'openai', apiKey: 'claude-secret', baseUrl: 'https://api.anthropic.com/v1' }));
        expect(response.status).toBe(200);
        expect((await response.json()).models[0].id).toBe('claude-sonnet');
        expect(mockFetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/models');
    });

    it('Gemini 官方端点使用请求头携带密钥', async () => {
        mockFetch.mockResolvedValueOnce(upstream({ models: [{ name: 'models/gemini-2.0-flash' }] }));
        const response = await POST(makeRequest({ provider: 'gemini', apiKey: 'gemini-secret' }));
        expect((await response.json()).models[0].id).toBe('gemini-2.0-flash');
        expect(mockFetch).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models', expect.objectContaining({
            redirect: 'error', headers: { 'x-goog-api-key': 'gemini-secret' },
        }));
    });

    it('不从 URL query 读取密钥或端点', async () => {
        expect((await POST(makeRequest({ provider: 'openai' }, '?apiKey=leaked&baseUrl=http://127.0.0.1'))).status).toBe(400);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('拒绝过大的上游响应，即使未声明 Content-Length', async () => {
        mockFetch.mockResolvedValueOnce(upstream({ data: [{ id: 'x'.repeat(1024 * 1024) }] }));
        const response = await POST(makeRequest({ provider: 'openai', apiKey: 'secret' }));
        expect((await response.json()).error).toBe('Model response too large');
    });

    it('请求设置上游超时且关闭重定向', async () => {
        mockFetch.mockResolvedValueOnce(upstream({ data: [] }));
        await POST(makeRequest({ provider: 'openai', apiKey: 'secret' }));
        const options = mockFetch.mock.calls[0][1];
        expect(options.signal).toBeInstanceOf(AbortSignal);
        expect(options.redirect).toBe('error');
    });

    it('上游失败不回显敏感信息', async () => {
        mockFetch.mockRejectedValueOnce(new Error('request failed with secret-key'));
        const response = await POST(makeRequest({ provider: 'openai', apiKey: 'secret-key' }));
        expect(JSON.stringify(await response.json())).not.toContain('secret-key');
    });
});
