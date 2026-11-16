import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { PROVIDER_PRESETS } from '@/lib/ai/provider-presets';

const logger = createLogger('api:ai:models');

interface ModelInfo {
    id: string;
    name: string;
    owned_by?: string;
}

// 从模型 ID 中提取短名称
function extractModelName(modelId: string): string {
    // models/gemini-2.0-flash -> gemini-2.0-flash
    return modelId.replace(/^models\//, '');
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

async function readModelsResponse(response: Response): Promise<any> {
    const length = response.headers.get('content-length');
    if (length && Number(length) > MAX_RESPONSE_BYTES) throw new Error('Model response too large');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty model response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE_BYTES) throw new Error('Model response too large');
            chunks.push(value);
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
}

async function fetchGeminiModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
    const response = await fetch(`${baseUrl}/v1beta/models`, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { 'x-goog-api-key': apiKey },
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await readModelsResponse(response);
    return (data.models || [])
        .map((m: any) => {
            const id = extractModelName(m.name);
            return {
                id,
                name: id,
                owned_by: 'Google',
            };
        });
}

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ModelInfo[]> {
    const response = await fetch(`${baseUrl}/models`, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        logger.error({ statusText: response.statusText }, 'OpenAI models API error');
        throw new Error(`API error: ${response.status}`);
    }

    const data = await readModelsResponse(response);

    return (data.data || [])
        .map((model: any) => ({
            id: model.id,
            name: model.id,
            owned_by: model.owned_by,
        }));
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let input: unknown;
    try {
        input = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { provider, apiKey, baseUrl } = input as Record<string, unknown>;
    if (provider !== 'gemini' && provider !== 'openai') {
        return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) {
        return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }
    if (baseUrl !== undefined && typeof baseUrl !== 'string') {
        return NextResponse.json({ error: 'Invalid base URL' }, { status: 400 });
    }

    const defaultUrl = provider === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : 'https://api.openai.com/v1';
    const allowedUrls = provider === 'gemini'
        ? [defaultUrl]
        : PROVIDER_PRESETS.map(preset => preset.baseUrl);
    const effectiveBaseUrl = baseUrl || defaultUrl;
    // 仅固定预设地址可由服务端代请求；自定义端点统一回退为手输模型。
    if (!allowedUrls.includes(effectiveBaseUrl)) {
        return NextResponse.json({ error: 'Custom model endpoint is not allowed; enter the model manually', models: [] }, { status: 403 });
    }

    try {
        const models = provider === 'gemini'
            ? await fetchGeminiModels(apiKey, effectiveBaseUrl)
            : await fetchOpenAIModels(apiKey, effectiveBaseUrl);
        return NextResponse.json({ models });
    } catch (error) {
        logger.error({ error: error instanceof Error ? error.name : 'Unknown' }, 'Error fetching models');
        const message = error instanceof Error && /^(Gemini API error:|API error:|Model response too large)/.test(error.message)
            ? error.message : 'Failed to fetch models';
        return NextResponse.json({ error: message, models: [] });
    }
}
