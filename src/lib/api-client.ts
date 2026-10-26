type RequestOptions = RequestInit & {
    params?: Record<string, string>;
    timeout?: number; // 超时时间（毫秒），默认 60000
};

export class ApiError extends Error {
    constructor(public status: number, public statusText: string, public data: unknown) {
        super(`API Error: ${status} ${statusText}`);
        this.name = 'ApiError';
    }
}

async function singleRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, timeout = 60000, ...rest } = options;

    let finalUrl = url;
    if (params) {
        const searchParams = new URLSearchParams(params);
        finalUrl += `?${searchParams.toString()}`;
    }

    const defaultHeaders: HeadersInit = {
        'Content-Type': 'application/json',
    };

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(finalUrl, {
            headers: {
                ...defaultHeaders,
                ...headers,
            },
            signal: controller.signal,
            ...rest,
        });
        const raw = res.status === 204 ? '' : await res.text();
        let parsed: unknown;
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: '服务返回的数据格式异常，请刷新页面后重试', code: 'INVALID_RESPONSE' }; }

        if (!res.ok) {
            throw new ApiError(res.status, res.statusText, parsed);
        }

        // Handle empty responses (e.g. 204 No Content)
        if (res.status === 204) {
            return {} as T;
        }

        if (typeof parsed === 'object' && parsed && 'code' in parsed && parsed.code === 'INVALID_RESPONSE') throw new ApiError(502, 'Invalid Response', parsed);
        return parsed as T;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
            throw new ApiError(408, 'Request Timeout', {
                message: 'AI_TIMEOUT_ERROR'
            });
        }
        if (error instanceof TypeError) throw new ApiError(0, 'Connection Failed', { message: '无法连接本地服务，请确认应用已启动，然后点击重试。', code: 'NETWORK_ERROR' });
        throw error;
    } finally { clearTimeout(timeoutId); }
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
    const attempts = !options.method || options.method === 'GET' ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try { return await singleRequest<T>(url, options); }
        catch (error) {
            if (attempt + 1 === attempts || !(error instanceof ApiError) || ![0, 502, 503, 504].includes(error.status)) throw error;
            await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
        }
    }
    throw new Error('请求未完成');
}

export function friendlyApiError(error: unknown): string {
    if (!(error instanceof ApiError)) return error instanceof Error && error.message && !/fetch|network|API Error/i.test(error.message) ? error.message : '暂时无法连接服务，请确认应用已启动后重试。';
    const data = error.data as { message?: string; code?: string } | null;
    if (error.status === 0) return '无法连接本地服务，请确认应用已启动，然后点击重试。';
    if (error.status === 401) return '登录状态已失效，请重新登录后继续。';
    if (error.status === 403) return '当前账号没有此操作权限，请检查账号或联系管理员。';
    if (error.status === 408) return '请求超时；分析或出题可能仍在后台进行，请稍后刷新结果，避免重复提交。';
    if (error.status === 429) return '请求过于频繁或模型额度不足，请稍后重试并检查服务商额度。';
    const codes: Record<string, string> = { AI_AUTH_ERROR: '模型密钥无效或未配置，请在左下角设置中检查大模型服务。', AI_CONNECTION_FAILED: '本地应用已连接，但大模型服务连接失败，请检查模型地址、网络或代理设置。', AI_TIMEOUT_ERROR: '大模型响应超时，请稍后刷新结果或调整模型超时时间。', AI_QUOTA_EXCEEDED: '模型额度不足或调用限流，请检查服务商额度后重试。', AI_NOT_FOUND: '模型或接口地址不存在，请检查模型名称与接口协议。', AI_RESPONSE_ERROR: '模型返回的内容不完整，请检查模型配置后重试。', AI_SERVICE_UNAVAILABLE: '模型服务繁忙或超时；请裁剪照片后重试，或在设置中为拍照批改选择其他识图模型。' };
    if (data?.message && codes[data.message]) return codes[data.message];
    if (data?.message && !/^API Error|<|Internal Server Error|AI_[A-Z_]+/.test(data.message)) return data.message;
    if (error.status >= 500) return '服务暂时不可用，可能正在启动或更新；请稍候重试。';
    return '操作未完成，请检查输入并重试。';
}

export const apiClient = {
    get: <T>(url: string, options?: RequestOptions) => request<T>(url, { ...options, method: 'GET' }),
    post: <TResponse, TBody = unknown>(url: string, body: TBody, options?: RequestOptions) => request<TResponse>(url, { ...options, method: 'POST', body: JSON.stringify(body) }),
    put: <TResponse, TBody = unknown>(url: string, body: TBody, options?: RequestOptions) => request<TResponse>(url, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    patch: <TResponse, TBody = unknown>(url: string, body: TBody, options?: RequestOptions) => request<TResponse>(url, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
    delete: <T>(url: string, options?: RequestOptions) => request<T>(url, { ...options, method: 'DELETE' }),
};
