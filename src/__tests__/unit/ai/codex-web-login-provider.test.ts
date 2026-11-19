import { describe, expect, it, vi } from 'vitest';

const codexCompletion = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ai/codex-cli', () => ({ codexCompletion }));
vi.mock('@/lib/config', () => ({ getAppConfig: () => ({ prompts: {} }) }));
vi.mock('@/lib/ai/tag-service', () => ({ getMathTagsFromDB: async () => [], getTagsFromDB: async () => [] }));
import { OpenAIProvider } from '@/lib/ai/openai-provider';

describe('Codex browser login provider', () => {
    it('uses the signed-in Codex command without requiring an API key', async () => {
        codexCompletion.mockResolvedValue('{"sourceText":"hello","translatedText":"你好"}');
        const provider = new OpenAIProvider({ providerId: 'codex', authMode: 'codex-cli', model: 'available-codex-model' });
        const result = await provider.translateImage('aGVsbG8=', 'image/png', '翻译图片');
        expect(result).toContain('你好');
        expect(codexCompletion).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: expect.any(Array) }),
        ]), 'available-codex-model', 60000);
    });
});
