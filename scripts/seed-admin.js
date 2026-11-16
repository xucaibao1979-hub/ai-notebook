const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

const DEFAULT_ADMIN = {
    email: 'admin@localhost',
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    isActive: true,
    educationStage: 'junior_high',
    enrollmentYear: 2025,
};

async function seedAdmin({ prisma, hash: hashPassword, password = process.env.ADMIN_INITIAL_PASSWORD }) {
    const existingAdmin = await prisma.user.findFirst({
        where: { role: 'admin' },
        orderBy: { createdAt: 'asc' },
    });

    if (existingAdmin) {
        return { action: 'existing' };
    }

    if (!password || password.length < 12 || password.trim() !== password || /^admin$/i.test(password)) {
        throw new Error('首次创建管理员需要设置至少 12 位的 ADMIN_INITIAL_PASSWORD（不可使用默认密码）。');
    }

    const occupiedEmail = await prisma.user.findFirst({ where: { email: DEFAULT_ADMIN.email } });
    if (occupiedEmail) {
        throw new Error('admin@localhost 已被普通用户占用；不会自动提权，请手动处理后再初始化管理员。');
    }

    const hashedPassword = await hashPassword(password, 12);

    await prisma.user.create({
        data: {
            email: DEFAULT_ADMIN.email,
            username: DEFAULT_ADMIN.username,
            password: hashedPassword,
            name: DEFAULT_ADMIN.name,
            role: DEFAULT_ADMIN.role,
            isActive: DEFAULT_ADMIN.isActive,
            educationStage: DEFAULT_ADMIN.educationStage,
            enrollmentYear: DEFAULT_ADMIN.enrollmentYear,
        },
    });

    return { action: 'created', email: DEFAULT_ADMIN.email };
}

async function main() {
    const prisma = new PrismaClient();

    try {
        const result = await seedAdmin({ prisma, hash });
        if (result.action === 'created') {
            console.log('Success! Admin user created.');
            console.log(`Email: ${result.email}`);
        } else {
            console.log('Existing admin user found; no changes made.');
        }
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { seedAdmin, DEFAULT_ADMIN };
