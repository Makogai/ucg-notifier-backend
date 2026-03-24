-- Rename existing tables to plural lowercase (Laravel-style)
-- This keeps Prisma model names singular in code but matches requested SQL tables.
RENAME TABLE
  `University` TO `universities`,
  `Faculty` TO `faculties`,
  `Program` TO `programs`,
  `Subject` TO `subjects`,
  `Post` TO `posts`,
  `User` TO `users`,
  `Subscription` TO `subscriptions`;

-- CreateTable
CREATE TABLE `faculty_staff` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `facultyId` INTEGER NOT NULL,
  `profileUrl` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `position` VARCHAR(191) NULL,
  `category` VARCHAR(191) NULL,
  `avatarUrl` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `faculty_staff_profileUrl_key`(`profileUrl`),
  INDEX `faculty_staff_facultyId_idx`(`facultyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `faculty_staff` ADD CONSTRAINT `faculty_staff_facultyId_fkey`
FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`)
ON DELETE RESTRICT ON UPDATE CASCADE;

