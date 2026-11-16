import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { session, updateMany, findFirstUser, findUniqueUser, findFirstSubject, compare, logInfo } = vi.hoisted(() => ({
  session: vi.fn(), updateMany: vi.fn(), findFirstUser: vi.fn(), findUniqueUser: vi.fn(),
  findFirstSubject: vi.fn(), compare: vi.fn(), logInfo: vi.fn(),
}));
vi.mock('next-auth', () => ({ getServerSession: (...args: unknown[]) => session(...args) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  errorItem: { updateMany, create: vi.fn() },
  user: { findFirst: findFirstUser, findUnique: findUniqueUser },
  subject: { findFirst: findFirstSubject },
} }));
vi.mock('bcryptjs', () => ({ compare: (...args: unknown[]) => compare(...args) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: logInfo, warn: vi.fn(), error: vi.fn() }) }));

import { PATCH } from '@/app/api/error-items/[id]/notes/route';
import { POST as upload } from '@/app/api/openclaw/batch-upload/route';
import { POST as logs } from '@/app/api/logs/frontend/route';

const json = (value: unknown) => new NextRequest('http://localhost/api', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value),
});
const patch = (value: unknown) => PATCH(json(value), { params: Promise.resolve({ id: 'item' }) });
const account = { id: 'root', email: 'root@example.com', isActive: true, parentUserId: null, password: 'hash' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  session.mockResolvedValue({ user: { id: 'learner', email: 'root@example.com' } });
  updateMany.mockResolvedValue({ count: 1 });
  findFirstUser.mockResolvedValue(account);
  findUniqueUser.mockResolvedValue(account);
  compare.mockResolvedValue(true);
});

describe('错题笔记授权', () => {
  it('匿名拒绝，且不按 email 查用户', async () => {
    session.mockResolvedValue(null);
    expect((await patch({ userNotes: 'hello' })).status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('用 learner id 原子限定更新，并只返回必要字段', async () => {
    const response = await patch({ userNotes: 'hello' });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'item', userId: 'learner' }, data: { userNotes: 'hello' } });
    expect(await response.json()).toEqual({ id: 'item', userNotes: 'hello' });
    expect(findUniqueUser).not.toHaveBeenCalled();
  });
  it('拒绝越权、非字符串和超长笔记', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    expect((await patch({ userNotes: 'hello' })).status).toBe(404);
    expect((await patch({ userNotes: 4 })).status).toBe(400);
    expect((await patch({ userNotes: 'a'.repeat(10001) })).status).toBe(400);
  });
});

describe('Openclaw 上传限制', () => {
  const payload = { username: 'root@example.com', password: 'pw', images: [{ filename: 'a.png', mimeType: 'image/png', base64: Buffer.alloc(32).toString('base64') }] };
  it('仅按唯一账号字段匹配活跃主账号', async () => {
    await upload(json(payload));
    expect(findFirstUser).toHaveBeenCalledWith({ where: {
      isActive: true, parentUserId: null, OR: [{ email: payload.username }, { username: payload.username }],
    } });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it('拒绝停用用户及家庭 learner', async () => {
    for (const changed of [{ isActive: false }, { parentUserId: 'root' }]) {
      findUniqueUser.mockResolvedValueOnce({ ...account, ...changed });
      process.env.OPENCLAW_AUTH_MODE = 'apikey';
      process.env.OPENCLAW_INTEGRATION_API_KEY = 'test-key';
      const response = await upload(new NextRequest('http://localhost/api', {
        method: 'POST', headers: { 'x-api-key': 'test-key' },
        body: JSON.stringify({ ...payload, userEmail: account.email }),
      }));
      expect(response.status).toBe(404);
    }
    delete process.env.OPENCLAW_AUTH_MODE;
    delete process.env.OPENCLAW_INTEGRATION_API_KEY;
  });
  it('拒绝不属于账号的 subjectId', async () => {
    findFirstSubject.mockResolvedValue(null);
    expect((await upload(json({ ...payload, subjectId: 'foreign' }))).status).toBe(400);
    expect(findFirstSubject).toHaveBeenCalledWith({ where: { id: 'foreign', userId: account.id }, select: { id: true } });
  });
  it('拒绝伪造图片魔数而不请求识别服务', async () => {
    const response = await upload(json(payload));
    expect(response.status).toBe(207);
    expect((await response.json()).failCount).toBe(1);
  });
});

describe('前端日志', () => {
  const entry = { level: 'info', prefix: 'ui', message: 'hello', timestamp: 'now', context: { source: 'forged', password: 'secret' } };
  it('匿名拒绝', async () => {
    session.mockResolvedValue(null);
    expect((await logs(json(entry))).status).toBe(401);
  });
  it('只记录允许字段，不允许客户端覆盖来源', async () => {
    const response = await logs(json(entry));
    expect(response.status).toBe(200);
    expect(logInfo).toHaveBeenCalledWith(expect.objectContaining({ source: 'frontend', userId: 'learner' }), 'hello');
    expect(logInfo.mock.calls[0][0]).not.toHaveProperty('password');
  });
  it('拒绝超大请求、过长批次和错误字段', async () => {
    expect((await logs(json({ ...entry, message: 'x'.repeat(33000) }))).status).toBe(413);
    expect((await logs(json({ logs: Array(21).fill(entry) }))).status).toBe(400);
    expect((await logs(json({ ...entry, level: 'debug' }))).status).toBe(400);
  });
});
