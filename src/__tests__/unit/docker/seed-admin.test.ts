import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { seedAdmin } = require('../../../../scripts/seed-admin.js');
const root = resolve(__dirname, '../../../..');
const securePassword = 'Test-only-safe-password-2026';

function mockPrisma(admin: unknown = null, occupied: unknown = null) {
    return {
        user: {
            findFirst: vi.fn().mockResolvedValueOnce(admin).mockResolvedValueOnce(occupied),
            create: vi.fn().mockResolvedValue({ email: 'admin@localhost' }),
            update: vi.fn(),
        },
    };
}

describe('管理员初始化', () => {
    it('首次创建仅使用环境提供的安全密码，日志结果不含明文', async () => {
        const prisma = mockPrisma();
        const hash = vi.fn().mockResolvedValue('hashed-password');
        const result = await seedAdmin({ prisma, hash, password: securePassword });

        expect(result).toEqual({ action: 'created', email: 'admin@localhost' });
        expect(hash).toHaveBeenCalledWith(securePassword, 12);
        expect(prisma.user.findFirst).toHaveBeenNthCalledWith(1, { where: { role: 'admin' }, orderBy: { createdAt: 'asc' } });
        expect(prisma.user.findFirst).toHaveBeenNthCalledWith(2, { where: { email: 'admin@localhost' } });
        expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            email: 'admin@localhost', password: 'hashed-password', role: 'admin',
        }) });
        expect(JSON.stringify(result)).not.toContain(securePassword);
    });

    it.each([undefined, '', 'admin', 'too-short'])('拒绝缺失或不安全的首次密码：%s', async (password) => {
        const prisma = mockPrisma();
        const hash = vi.fn();
        await expect(seedAdmin({ prisma, hash, password })).rejects.toThrow('ADMIN_INITIAL_PASSWORD');
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(hash).not.toHaveBeenCalled();
    });

    it('普通 admin@localhost 不会被提权，也不会被重置密码', async () => {
        const prisma = mockPrisma(null, { id: 'ordinary', email: 'admin@localhost', role: 'user' });
        const hash = vi.fn();
        await expect(seedAdmin({ prisma, hash, password: securePassword })).rejects.toThrow('不会自动提权');
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(hash).not.toHaveBeenCalled();
    });

    it('现有管理员升级时不需要首次密码，也不会更改角色、状态或密码', async () => {
        const prisma = mockPrisma({ id: 'existing', role: 'admin', isActive: false });
        const hash = vi.fn();
        expect(await seedAdmin({ prisma, hash, password: undefined })).toEqual({ action: 'existing' });
        expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(hash).not.toHaveBeenCalled();
    });
});

describe('Docker 镜像密钥隔离', () => {
    it('排除根目录和嵌套的 .env 与 app-config.json', () => {
        const patterns = readFileSync(resolve(root, '.dockerignore'), 'utf8').split(/\r?\n/);
        expect(patterns).toContain('.env');
        expect(patterns).toContain('.env.*');
        expect(patterns).toContain('**/.env');
        expect(patterns).toContain('**/.env.*');
        expect(patterns).toContain('**/app-config.json');
    });

    it('构建阶段不创建管理员，运行镜像不复制 config 目录', () => {
        const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
        expect(dockerfile).not.toMatch(/prisma db seed|COPY\s+--from=builder\s+[^\n]*\/app\/config\b/);
        expect(dockerfile).toMatch(/mkdir -p \/app\/config/);
        const entrypoint = readFileSync(resolve(root, 'docker-entrypoint.sh'), 'utf8');
        expect(entrypoint).toMatch(/node "\$SEED_ADMIN_SCRIPT"/);
        expect(entrypoint).not.toMatch(/Admin seed failed \(non-fatal/);
    });

    it('Prisma 手动种子也不使用默认密码或按邮箱提权', () => {
        const seed = readFileSync(resolve(root, 'prisma/seed.ts'), 'utf8');
        expect(seed).toContain('ADMIN_INITIAL_PASSWORD');
        expect(seed).not.toMatch(/password\s*=\s*['"]admin['"]|Password:\s*\$\{password\}|OR:\s*\[\{ role:/);
    });
});
