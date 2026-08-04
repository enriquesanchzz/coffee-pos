import { PrismaClient } from "@prisma/client";

// Evita crear un nuevo PrismaClient en cada hot-reload en desarrollo
// (Next.js recarga módulos de servidor, PrismaClient no está pensado para
// eso — ver https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices).
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
