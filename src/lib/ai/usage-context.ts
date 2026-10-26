import {AsyncLocalStorage} from 'async_hooks';
export type TokenUsage={inputTokens?:number;outputTokens?:number};
export const usageContext=new AsyncLocalStorage<TokenUsage>();
export function captureTokenUsage(inputTokens?:number,outputTokens?:number){const state=usageContext.getStore();if(!state)return;if(Number.isInteger(inputTokens))state.inputTokens=(state.inputTokens||0)+inputTokens!;if(Number.isInteger(outputTokens))state.outputTokens=(state.outputTokens||0)+outputTokens!;}
