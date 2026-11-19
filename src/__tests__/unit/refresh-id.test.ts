import { expect, it, vi } from 'vitest';
import { learningRequestSchema } from '@/lib/learning';
import { createRefreshId } from '@/lib/refresh-id';

it('creates distinct server-valid refresh IDs when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); }) });
    const first = createRefreshId();
    const second = createRefreshId();
    expect(first).not.toBe(second);
    expect(learningRequestSchema.parse({ mode: 'daily', source: 'network', subject: '语文', refreshId: first }).refreshId).toBe(first);
    vi.unstubAllGlobals();
});
