import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma CLI resolves relative SQLite URLs from the schema directory, while
// a bundled Next server can resolve them from a generated chunk. Normalize
// the same URL explicitly so development and production open the same file.
function datasourceUrl(): string {
  const configured = process.env.DATABASE_URL?.trim() || "file:./dev.db";
  if (!configured.startsWith("file:")) return configured;

  const filePath = configured.slice("file:".length);
  if (path.isAbsolute(filePath)) return `file:${filePath}`;

  return `file:${path.resolve(process.cwd(), "prisma", filePath)}`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: datasourceUrl() });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
