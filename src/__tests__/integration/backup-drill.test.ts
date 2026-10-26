import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), restore: vi.fn() }));
vi.mock('next-auth', () => ({ getServerSession: mocks.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/complete-backup', () => ({ createBackup: mocks.create, restoreBackup: mocks.restore, validateBackup: vi.fn() }));

import { POST } from '@/app/api/backup/route';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'student-1' } });
    mocks.create.mockResolvedValue({ version: 2, data: {} });
    mocks.restore.mockResolvedValue({ homework: 2, revisions: 3 });
});

it('checks a fresh backup through restore validation without writing records', async () => {
    const response = await POST(new Request('http://localhost/api/backup', { method: 'POST', body: JSON.stringify({ action: 'verify-current' }) }));
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith('student-1');
    expect(mocks.restore).toHaveBeenCalledWith({ version: 2, data: {} }, 'student-1', true);
    expect(mocks.restore).toHaveBeenCalledTimes(1);
    expect((await response.json()).counts).toEqual({ homework: 2, revisions: 3 });
});

it('requires sign-in for a restore drill', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(new Request('http://localhost/api/backup', { method: 'POST', body: '{"action":"verify-current"}' }))).status).toBe(401);
});
