import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env";

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

function toMariaDbPoolConfig(databaseUrl: string): any {
  // Prisma MariaDB driver expects a `mariadb://` compatible URL shape.
  const mariadbUrl = databaseUrl.replace(/^mysql:\/\//i, "mariadb://");
  const url = new URL(mariadbUrl);

  const host = url.hostname;
  const port = url.port ? Number(url.port) : 3306;
  const user = url.username;
  const password = url.password; // may be empty
  const database = url.pathname.replace(/^\//, "");

  const connectionLimit = 3;

  // If password is empty, omit it so the driver doesn’t interpret it as an explicit empty-password token.
  const base: Record<string, unknown> = {
    host,
    port,
    user,
    database,
    connectionLimit,
  };
  if (password) base.password = password;

  return base;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    // Prisma ORM 7 requires a driver adapter for direct MySQL connections.
    adapter: new PrismaMariaDb(toMariaDbPoolConfig(env.DATABASE_URL)),
  } as any);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

