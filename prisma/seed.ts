import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@localhost';
    const password = 'admin';
    const name = 'Admin';

    console.log(`Checking admin user: ${email}...`);

    const existingUser = await prisma.user.findFirst({
        where: { OR: [{ role: 'admin' }, { email }] },
        orderBy: { createdAt: 'asc' },
    });

    if (existingUser) {
        console.log(`Admin user already exists. Updating defaults...`);
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                ...(existingUser.username ? {} : { username: 'admin' }),
                educationStage: 'junior_high',
                enrollmentYear: 2025,
            }
        });
        return;
    }

    console.log(`Admin user not found. Creating...`);
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
    console.log(`Password: ${password}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
