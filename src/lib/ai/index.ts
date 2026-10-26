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
    return new Proxy(service, { get(target, property) {
        const value = Reflect.get(target, property);
        if(property==='constructor'||typeof value !== 'function') return value;
        return async (...args:unknown[]) => {
            const started = Date.now(); let success=false; let errorReason:string|undefined;const tokens:TokenUsage={};
            try { const result = await usageContext.run(tokens,()=>Reflect.apply(value, target, args)); success=true; return result; }
            catch(error) { errorReason=modelErrorMessage(error); throw error; }
            finally { if(userId) try { await prisma.aIUsage.create({data:{userId,task:task || String(property),model,durationMs:Date.now()-started,success,errorReason,...tokens}}); } catch { /* Metrics must not interrupt learning. */ } }
        };
    } });
}
