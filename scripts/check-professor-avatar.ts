import { prisma } from "../src/prisma/client";

async function main() {
  const profileUrl =
    process.env.SCRAPER_TEST_PROFILE_URL?.trim() ??
    "https://ucg.ac.me/radnik/130329-budimir-lutovac";

  const professor = await prisma.professor.findUnique({
    where: { profileUrl },
    select: { id: true, profileUrl: true, name: true, avatarUrl: true },
  });

  console.log(
    JSON.stringify(
      {
        professor,
        usesPlaceholderAvatar:
          professor?.avatarUrl?.includes("hreusmall.png") ?? false,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

