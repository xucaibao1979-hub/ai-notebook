export function modelErrorMessage(error:unknown){
 const message=error instanceof Error?error.message:String(error);
 if(/AI_AUTH_ERROR|401|unauthorized/i.test(message))return '模型密钥无效或未配置，请检查大模型设置。';
 if(/AI_PERMISSION_DENIED|403/i.test(message))return '模型服务拒绝访问，请检查账号权限。';
 if(/AI_NOT_FOUND|404/i.test(message))return '模型名称或接口地址不存在，请检查设置。';
 if(/AI_QUOTA_EXCEEDED|429|quota|rate.limit/i.test(message))return '模型额度不足或调用限流，请稍后重试或切换备用模型。';
 if(/AI_SERVICE_UNAVAILABLE|504|503|gateway.timeout|upstream/i.test(message))return '拍照识别模型响应超时或服务繁忙。请裁剪图片后重试，或在设置 → 大模型服务中为拍照批改选择其他支持识图的模型。';
 if(/AI_TIMEOUT_ERROR|timeout|aborted/i.test(message))return '模型响应超时，请稍后检查练习历史，或切换备用模型。';
 if(/AI_CONNECTION_FAILED|fetch failed|ECONN|ENOTFOUND/i.test(message))return '大模型连接失败，请检查接口地址、网络或代理。';
 if(/AI_RESPONSE_ERROR/i.test(message))return '模型返回内容不完整，请重新生成或更换模型。';
 if(/AI_REQUEST_INVALID|\b400\b|\b422\b/i.test(message))return '模型接口不接受当前请求参数或协议，请检查模型名称与接口协议。';
 return '模型处理失败，请检查连接或切换备用模型。';
}
