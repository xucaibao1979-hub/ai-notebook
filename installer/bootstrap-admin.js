const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const { hash } = require('bcryptjs');

async function main() {
    const prisma = new PrismaClient();
    try {
        // Only a fresh local installation receives the requested default account.
        if (await prisma.user.count() !== 0) {
            console.log('Existing accounts kept unchanged.');
            return;
        }
        await prisma.user.create({
            data: {
                email: 'admin@localhost',
                username: 'admin',
                name: 'Admin',
                password: await hash('admin', 12),
                role: 'admin',
                isActive: true,
            },
        });
        console.log('Created local default admin account.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
