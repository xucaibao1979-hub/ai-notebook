import { AIService } from "./types";
import { GeminiProvider } from "./gemini-provider";
import { OpenAIProvider } from "./openai-provider";
import { AzureOpenAIProvider } from "./azure-provider";

export * from "./types";

import { getAppConfig, getActiveOpenAIConfig } from "../config";
import { createLogger } from "../logger";
import { usageContext, TokenUsage } from './usage-context';
import { prisma } from '../prisma';
import { modelErrorMessage } from './error-message';

const logger = createLogger('ai');

export function getAIService(task?: 'analyze' | 'homework' | 'generate' | 'catalog' | 'review' | 'weekly', userId?: string): AIService {
    // Always get fresh config
    const config = getAppConfig();
    const selected = task && config.taskModels?.[task];
    const instance = selected ? config.openai?.instances?.find(i => i.id === selected) : undefined;
    const provider = instance ? 'openai' : config.aiProvider;
    let service: AIService;

    if (provider === "openai") {
        const activeConfig = instance || getActiveOpenAIConfig();
        logger.info({ activeInstance: activeConfig?.name }, 'Using OpenAI Provider');
        service = new OpenAIProvider(activeConfig);
    } else if (provider === "azure") {
        logger.info({ deployment: config.azure?.deploymentName }, 'Using Azure OpenAI Provider');
        service = new AzureOpenAIProvider(config.azure);
    } else {
        logger.info('Using Gemini Provider');
        service = new GeminiProvider(config.gemini);
    }
    const model = instance?.model || (provider === 'openai' ? getActiveOpenAIConfig()?.model : provider === 'azure' ? config.azure?.deploymentName : config.gemini?.model) || provider;
    const activeId = instance?.id || config.openai?.activeInstanceId;
    const backup = config.openai?.instances?.find(item => item.id === config.backupInstanceId && item.id !== activeId && (item.apiKey?.trim() || item.authMode === 'codex-cli'));
    return new Proxy(service, { get(target, property) {
        const value = Reflect.get(target, property);
        if(property==='constructor'||typeof value !== 'function') return value;
        return async (...args:unknown[]) => {
            const started = Date.now(); let success=false; let errorReason:string|undefined; let usedModel=model;const tokens:TokenUsage={};
            try {
                try { const result = await usageContext.run(tokens,()=>Reflect.apply(value, target, args)); success=true; return result; }
                catch (primaryError) {
                    if (!backup || !(primaryError instanceof Error) || !/AI_NOT_FOUND|model_not_found/i.test(primaryError.message)) throw primaryError;
                    logger.warn({ primaryModel: model, backupModel: backup.model }, 'Primary model unavailable; trying configured backup');
                    const backupService = new OpenAIProvider(backup);
                    const backupMethod = Reflect.get(backupService, property);
                    if (typeof backupMethod !== 'function') throw primaryError;
                    usedModel=backup.model;
                    const result = await usageContext.run(tokens,()=>Reflect.apply(backupMethod, backupService, args));
                    success=true; return result;
                }
            }
            catch(error) { errorReason=modelErrorMessage(error); throw error; }
            finally { if(userId) try { await prisma.aIUsage.create({data:{userId,task:task || String(property),model:usedModel,durationMs:Date.now()-started,success,errorReason,...tokens}}); } catch { /* Metrics must not interrupt learning. */ } }
        };
    } });
}
