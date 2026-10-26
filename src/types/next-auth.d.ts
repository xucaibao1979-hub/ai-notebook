import { DefaultSession } from "next-auth"

declare module "next-auth" {
    interface Session {
        user: {
            id: string
            accountId?: string
            role?: string
            username?: string | null
        } & DefaultSession["user"]
    }

    interface User {
        username?: string | null
        role?: string
        isActive?: boolean
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string
        learnerId?: string
        role?: string
    }
}
