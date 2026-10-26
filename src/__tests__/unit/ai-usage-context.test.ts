import {it,expect} from 'vitest';
import {usageContext,captureTokenUsage,TokenUsage} from '@/lib/ai/usage-context';
it('keeps actual token usage isolated across concurrent calls',async()=>{const first:TokenUsage={},second:TokenUsage={};await Promise.all([usageContext.run(first,async()=>{captureTokenUsage(10,2);await Promise.resolve();captureTokenUsage(3,1);}),usageContext.run(second,async()=>{captureTokenUsage(99,8);})]);expect(first).toEqual({inputTokens:13,outputTokens:3});expect(second).toEqual({inputTokens:99,outputTokens:8});});
it('does not invent token usage when the provider omits it',()=>{const state:TokenUsage={};usageContext.run(state,()=>captureTokenUsage());expect(state).toEqual({});});
