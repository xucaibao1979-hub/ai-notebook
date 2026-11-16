import { describe, it, expect, vi, beforeEach } from 'vitest';

const sdkOptions = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@google/genai', () => {
    return {
        GoogleGenAI: class MockGoogleGenAI {
            constructor(options: unknown) { sdkOptions(options); }
            models = {
                generateContent: vi.fn(),
            };
        },
    };
});

vi.mock('@/lib/logger', () => ({
    createLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        box: vi.fn(),
    })),
}));

vi.mock('@/lib/config', () => ({
    getAppConfig: vi.fn(() => ({
        prompts: {},
    })),
}));

vi.mock('@/lib/ai/schema', () => ({
    safeParseParsedQuestion: vi.fn((data) => ({ success: true, data })),
}));

// Mock tag service to avoid DB calls
vi.mock('@/lib/ai/tag-service', () => ({
    getMathTagsFromDB: vi.fn().mockResolvedValue([]),
    getTagsFromDB: vi.fn().mockResolvedValue([]),
}));

import { GeminiProvider } from '@/lib/ai/gemini-provider';

describe('GeminiProvider Retry Logic', () => {
    let provider: GeminiProvider;
    let mockGenerateContent: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new GeminiProvider({ apiKey: 'test-key' });
        // @ts-expect-error - accessing private property for testing
        mockGenerateContent = provider.ai.models.generateContent;
    });

    it('SDK 使用请求超时配置，调用不叠加自定义重试', async () => {
        expect(sdkOptions).toHaveBeenCalledWith(expect.objectContaining({ httpOptions: expect.objectContaining({ timeout: 60000 }) }));
        mockGenerateContent.mockRejectedValueOnce(new Error('request timeout'));
        await expect(provider.analyzeImage('base64data')).rejects.toThrow('AI_TIMEOUT_ERROR');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('should throw immediately on non-retryable error', async () => {
        mockGenerateContent.mockRejectedValue(new Error('AI_AUTH_ERROR: Invalid API Key'));

        // Should fail immediately without retrying
        await expect(provider.analyzeImage('base64data'))
            .rejects
            .toThrow('AI_AUTH_ERROR');

        // Only 1 call, no retries for auth errors
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('网络错误不会在 provider 层重试', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('fetch failed'));
        await expect(provider.analyzeImage('base64data')).rejects.toThrow('AI_CONNECTION_FAILED');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('503 不在 provider 层重试', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('503 Service Unavailable'));
        await expect(provider.analyzeImage('base64data')).rejects.toThrow('AI_SERVICE_UNAVAILABLE');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('其他调用同样不叠加重试', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('503 Service Unavailable'));
        await expect(provider.reviewExercise('检查题目')).rejects.toThrow('503');
        expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
});
