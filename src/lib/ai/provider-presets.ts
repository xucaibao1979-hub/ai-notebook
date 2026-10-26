export interface ProviderPreset {
    id: string; name: string; baseUrl: string; model: string; apiMode: 'chat' | 'responses'; docs: string; note?: string;
}

// Addresses and example model IDs are editable; account/region availability is checked by the connection test.
export const PROVIDER_PRESETS: ProviderPreset[] = [
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', apiMode: 'chat', docs: 'https://developers.openai.com/api/docs/models' },
    { id: 'codex', name: 'OpenAI Codex', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.3-codex', apiMode: 'responses', docs: 'https://developers.openai.com/api/docs/models/gpt-5.3-codex', note: '通过 Responses API 调用 Codex 模型。需 OpenAI API 密钥，不能使用 Codex 应用的登录凭据。' },
    { id: 'alibaba', name: '阿里 · 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', apiMode: 'chat', docs: 'https://help.aliyun.com/zh/model-studio/first-api-call-to-qwen', note: '请使用百炼控制台对应地域和业务空间的地址；新版业务空间可能使用专属域名。' },
    { id: 'baidu', name: '百度 · 文心千帆', baseUrl: 'https://qianfan.baidubce.com/v2', model: '', apiMode: 'chat', docs: 'https://cloud.baidu.com/doc/qianfan-docs/s/Fm9l6ocai', note: '填入千帆控制台已开通的文心模型 ID，或通过模型列表选择。' },
    { id: 'tencent', name: '腾讯 · 混元', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', model: 'hunyuan-turbos-latest', apiMode: 'chat', docs: 'https://cloud.tencent.cn/document/product/1729/111007', note: '此预设为原混元兼容域名。新账号请按 TokenHub 控制台修改服务地址和模型 ID。' },
    { id: 'zhipu', name: '智谱 · GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-5.3', apiMode: 'chat', docs: 'https://docs.bigmodel.cn/cn/guide/develop/openai/introduction' },
    { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiMode: 'chat', docs: 'https://api-docs.deepseek.com/' },
    { id: 'volcengine', name: '字节 · 豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seed-2-1-pro-260628', apiMode: 'chat', docs: 'https://docs.volcengine.com/docs/ark/compatible-with-openai-sdk?lang=zh', note: '使用方舟 API Key，模型 ID 或已开通的推理接入点 ID。' },
    { id: 'moonshot', name: '月之暗面 · Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3', apiMode: 'chat', docs: 'https://platform.kimi.com/docs/get-api-key' },
    { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.cn/v1', model: 'MiniMax-M2.7', apiMode: 'chat', docs: 'https://platform.minimax.cn/docs/api-reference/text-openai-api' },
    { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: '', apiMode: 'chat', docs: 'https://docs.siliconflow.cn/docs/userguide/quickstart', note: '选择账户已开通的模型 ID，通常带组织前缀；可以获取模型列表或手动填写。' },
];
