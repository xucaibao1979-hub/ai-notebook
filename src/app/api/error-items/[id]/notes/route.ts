import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:error-items:notes');

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return unauthorized("Authentication required");

    try {
        const body = await req.json();
        if (!body || typeof body.userNotes !== 'string' || body.userNotes.length > 10000) {
            return NextResponse.json({ error: 'Invalid userNotes' }, { status: 400 });
        }

        const result = await prisma.errorItem.updateMany({
            where: { id, userId: session.user.id },
            data: { userNotes: body.userNotes },
        });
        if (result.count === 0) {
            return NextResponse.json({ error: 'Error item not found' }, { status: 404 });
        }

        return NextResponse.json({ id, userNotes: body.userNotes });
    } catch (error) {
        logger.error({ error }, 'Error updating notes');
        return internalError("Failed to update notes");
    }
}
