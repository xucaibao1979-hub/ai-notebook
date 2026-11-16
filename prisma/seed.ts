import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@localhost';
    const name = 'Admin';

    const existingAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
        orderBy: { createdAt: 'asc' },
    });

    if (existingAdmin) {
        console.log('Existing admin user found; no changes made.');
        return;
    }

    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!password || password.length < 12 || password.trim() !== password || /^admin$/i.test(password)) {
        throw new Error('首次创建管理员需要设置至少 12 位的 ADMIN_INITIAL_PASSWORD（不可使用默认密码）。');
    }

    const occupiedEmail = await prisma.user.findFirst({ where: { email } });
    if (occupiedEmail) {
        throw new Error('admin@localhost 已被普通用户占用；不会自动提权，请手动处理后再初始化管理员。');
    }

    const hashedPassword = await hash(password, 12);

    const user = await prisma.user.create({
        data: {
            email,
            username: 'admin',
            password: hashedPassword,
            name,
            role: 'admin',
            isActive: true,
            educationStage: 'junior_high',
            enrollmentYear: 2025,
        },
    });

    console.log(`\nSuccess! Admin user created.`);
    console.log(`Email: ${user.email}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
