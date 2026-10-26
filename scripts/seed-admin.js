const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

const DEFAULT_ADMIN = {
    email: 'admin@localhost',
    password: 'admin',
    username: 'admin',
    name: 'Admin',
    role: 'admin',
    isActive: true,
    educationStage: 'junior_high',
    enrollmentYear: 2025,
};

async function seedAdmin({ prisma, hash: hashPassword }) {
    const existingUser = await prisma.user.findFirst({
        where: { OR: [{ role: 'admin' }, { email: DEFAULT_ADMIN.email }] },
        orderBy: { createdAt: 'asc' },
    });

    if (existingUser) {
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                role: DEFAULT_ADMIN.role,
                ...(existingUser.username ? {} : { username: DEFAULT_ADMIN.username }),
                isActive: DEFAULT_ADMIN.isActive,
                educationStage: existingUser.educationStage ?? DEFAULT_ADMIN.educationStage,
                enrollmentYear: existingUser.enrollmentYear ?? DEFAULT_ADMIN.enrollmentYear,
            },
        });
        return { action: 'updated', email: DEFAULT_ADMIN.email };
    }

    const hashedPassword = await hashPassword(DEFAULT_ADMIN.password, 12);

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
            console.log(`Password: ${DEFAULT_ADMIN.password}`);
        } else {
            console.log('Admin user already exists. Updated defaults.');
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
