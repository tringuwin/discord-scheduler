import { PrismaClient } from '@prisma/client';

/** Shared Prisma client. Import this everywhere data access is needed. */
export const prisma = new PrismaClient();
