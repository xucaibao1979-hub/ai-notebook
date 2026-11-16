'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticeSession, ToolPracticeKind } from '@/lib/tool-practice-session';

type Session<K extends ToolPracticeKind> = Extract<PracticeSession, { kind: K }>;
type Settings<K extends ToolPracticeKind> = Session<K>['settings'];

export class PracticeSessionError extends Error {
    constructor(message: string, public readonly status: number) { super(message); }
}

const endpoint = '/api/tools/practice-session';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(url, { ...options, cache: 'no-store' });
    } catch {
        throw new PracticeSessionError('网络连接失败，请重试', 0);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new PracticeSessionError(typeof data?.message === 'string' ? data.message : '练习请求失败', response.status);
    return data as T;
}

export function useToolPracticeSession<K extends ToolPracticeKind>(kind: K) {
    const [session, setSession] = useState<Session<K> | null>(null);
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const current = useRef<Session<K> | null>(null);
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    const failed = useRef(false);
    const epoch = useRef(0);
    const active = useRef(false);
    const pending = useRef(0);

    const restore = useCallback(async () => {
        const stamp = ++epoch.current;
        await queue.current.catch(() => {});
        if (stamp !== epoch.current) return current.current;
        setReady(false);
        setError(null);
        try {
            const saved = await request<Session<K> | null>(`${endpoint}?kind=${encodeURIComponent(kind)}`);
            if (epoch.current === stamp) {
                current.current = saved;
                failed.current = false;
                setSession(saved);
            }
            return saved;
        } catch (cause) {
            if (epoch.current === stamp) setError(cause instanceof Error ? cause.message : '读取练习失败');
            throw cause;
        } finally {
            if (epoch.current === stamp) setReady(true);
        }
    }, [kind]);

    useEffect(() => {
        active.current = true;
        void restore().catch(() => {});
        return () => { active.current = false; epoch.current = epoch.current + 1; };
    }, [restore]);

    const enqueue = useCallback((action: (latest: Session<K> | null) => Promise<Session<K>>, publish: boolean) => {
        const stamp = epoch.current;
        pending.current++;
        setSaving(true);
        const task = queue.current.catch(() => {}).then(async () => {
            if (!active.current || stamp !== epoch.current || failed.current) throw new PracticeSessionError('保存队列已中断，请重新读取练习', 409);
            setError(null);
            try {
                const saved = await action(current.current);
                if (stamp === epoch.current) {
                    current.current = saved;
                    // 逐键保存的旧响应不能覆盖页面正在输入的本地状态。
                    if (publish) setSession(saved);
                }
                return saved;
            } catch (cause) {
                if (stamp === epoch.current) {
                    failed.current = true;
                    setError(cause instanceof Error ? cause.message : '保存练习失败');
                }
                throw cause;
            }
        }).finally(() => {
            pending.current--;
            if (stamp === epoch.current) setSaving(pending.current > 0);
        });
        queue.current = task;
        return task;
    }, []);

    const start = useCallback((settings: Settings<K>) => {
        const snapshot = { ...settings };
        return enqueue(latest => request<Session<K>>(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind, settings: snapshot, revision: latest?.revision ?? null }),
        }), true);
    }, [enqueue, kind]);

    const save = useCallback((answers: Record<number, string>, submitted: boolean) => {
        const snapshot = { ...answers };
        return enqueue(latest => {
            if (!latest) throw new PracticeSessionError('请先创建练习', 400);
            return request<Session<K>>(endpoint, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, revision: latest.revision, answers: snapshot, submitted }),
            });
        }, submitted);
    }, [enqueue, kind]);

    const retry = useCallback(async (answers: Record<number, string>, submitted: boolean) => {
        const latest = await restore();
        if (latest?.submitted) return latest;
        return save(answers, submitted);
    }, [restore, save]);

    return { session, ready, saving, error, restore, start, save, retry };
}
