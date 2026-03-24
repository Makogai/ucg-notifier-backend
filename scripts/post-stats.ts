import { prisma } from "../src/prisma/client";

async function main() {
  const total = await prisma.post.count();
  const published = await prisma.post.count({ where: { publishedAt: { not: null } } });
  const latest = await prisma.post.findFirst({
    orderBy: { publishedAt: "desc" },
    select: { id: true, title: true, publishedAt: true, createdAt: true },
  });
  const latestCreated = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, publishedAt: true, createdAt: true },
  });

  console.log(JSON.stringify({ total, published, latest, latestCreated }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

