import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PROVIDER_PRESETS } from '@/lib/ai/provider-presets';
const mocks = vi.hoisted(() => ({ chat: vi.fn(), responses: vi.fn() }));
vi.mock('openai', () => ({ default: class {
    chat = { completions: { create: mocks.chat } };
    responses = { create: mocks.responses };
} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), box: vi.fn() }) }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => ({ prompts: {} }) }));
vi.mock('@/lib/ai/tag-service', () => ({ getMathTagsFromDB: async () => [], getTagsFromDB: async () => [] }));
import { OpenAIProvider } from '@/lib/ai/openai-provider';

const output = '<subject>数学</subject><knowledge_points>加法</knowledge_points><question_text>2+3=?</question_text><answer_text>5</answer_text><analysis>相加得到5。</analysis>';
beforeEach(() => {
    mocks.responses.mockResolvedValue({ id: 'response-id', created_at: 1, model: 'gpt-5.3-codex', status: 'completed', output_text: output });
    mocks.chat.mockResolvedValue({ choices: [{ message: { content: output } }] });
});

describe('provider presets and Responses adapter', () => {
    it('includes the requested providers and editable endpoint/model presets', () => {
        for (const id of ['openai', 'codex', 'alibaba', 'baidu', 'tencent', 'zhipu', 'deepseek', 'volcengine', 'moonshot', 'minimax', 'siliconflow']) expect(PROVIDER_PRESETS.some(preset => preset.id === id)).toBe(true);
        expect(PROVIDER_PRESETS.find(preset => preset.id === 'codex')?.apiMode).toBe('responses');
    });
    it('routes Codex text exercises through Responses, preserving instructions and using final output', async () => {
        const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.3-codex' });
        const result = await provider.generateSimilarQuestion('1+1=?', ['加法']);
        expect(result.answerText).toBe('5');
        expect(mocks.chat).not.toHaveBeenCalled();
        expect(mocks.responses).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.3-codex', instructions: expect.any(String), input: expect.any(Array), store: false }));
        expect(mocks.responses.mock.calls[0][0]).not.toHaveProperty('max_tokens');
    });
    it('converts image input to Responses input_image content', async () => {
        const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.3-codex', apiMode: 'responses' });
        await provider.analyzeImage('base64-data', 'image/png');
        const request = mocks.responses.mock.calls[0][0];
        expect(JSON.stringify(request.input)).toContain('input_image');
        expect(JSON.stringify(request.input)).toContain('data:image/png;base64,base64-data');
    });
    it('keeps normal compatible providers on Chat Completions', async () => {
        const provider = new OpenAIProvider({ apiKey: 'test-key', baseUrl: 'https://vendor.example/v1', model: 'vendor-model', apiMode: 'chat' });
        await provider.generateSimilarQuestion('1+1=?', ['加法']);
        expect(mocks.chat).toHaveBeenCalled();
        expect(mocks.responses).not.toHaveBeenCalled();
    });
    it('rejects incomplete Responses output instead of parsing a truncated answer', async () => {
        mocks.responses.mockResolvedValue({ status: 'incomplete', output_text: output });
        const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.3-codex' });
        await expect(provider.generateSimilarQuestion('1+1=?', ['加法'])).rejects.toThrow('AI_RESPONSE_ERROR');
    });
});
