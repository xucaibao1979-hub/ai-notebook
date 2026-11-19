import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    primary: vi.fn(), backup: vi.fn(), usage: vi.fn(),
}));
vi.mock('@/lib/config', () => ({
    getAppConfig: () => ({ aiProvider: 'openai', openai: { activeInstanceId: 'primary', instances: [
        { id: 'primary', name: 'Codex', model: 'unavailable-model', providerId: 'codex', authMode: 'codex-cli' },
        { id: 'backup', name: 'Backup', model: 'available-model', apiKey: 'test-key' },
    ] }, backupInstanceId: 'backup' }),
    getActiveOpenAIConfig: () => ({ id: 'primary', name: 'Codex', model: 'unavailable-model' }),
}));
vi.mock('@/lib/ai/openai-provider', () => ({
    OpenAIProvider: class {
        generateSimilarQuestion: typeof mocks.primary;
        constructor(config: { id: string }) { this.generateSimilarQuestion = config.id === 'backup' ? mocks.backup : mocks.primary; }
    },
}));
vi.mock('@/lib/prisma', () => ({ prisma: { aIUsage: { create: mocks.usage } } }));

import { getAIService } from '@/lib/ai';

describe('configured backup model', () => {
    beforeEach(() => { vi.clearAllMocks(); mocks.usage.mockResolvedValue({}); });
    it('uses the backup when the active model is unavailable', async () => {
        mocks.primary.mockRejectedValue(new Error('AI_NOT_FOUND: model_not_found'));
        mocks.backup.mockResolvedValue({ questionText: '新题' });
        const result = await getAIService('generate', 'student').generateSimilarQuestion('prompt', [], 'zh', 'medium');
        expect(result.questionText).toBe('新题');
        expect(mocks.backup).toHaveBeenCalledOnce();
        expect(mocks.usage).toHaveBeenCalledWith({ data: expect.objectContaining({ model: 'available-model', success: true }) });
    });
});
