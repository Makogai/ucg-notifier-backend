import { prisma } from "../src/prisma/client";

async function main() {
  const profileUrl =
    process.env.SCRAPER_TEST_PROFILE_URL?.trim() ??
    "https://ucg.ac.me/radnik/130329-budimir-lutovac";

  const professor = await prisma.professor.findUnique({
    where: { profileUrl },
    select: {
      id: true,
      profileUrl: true,
      name: true,
      biographyHtml: true,
      biographyText: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        id: professor?.id ?? null,
        name: professor?.name ?? null,
        biographyHtmlLen: professor?.biographyHtml?.length ?? 0,
        biographyTextLen: professor?.biographyText?.length ?? 0,
        biographyPreview:
          professor?.biographyHtml ? professor.biographyHtml.slice(0, 200) : null,
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

