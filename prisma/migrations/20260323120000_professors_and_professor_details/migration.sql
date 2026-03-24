-- Professor details + allow full staff import across categories
-- New schema:
-- - `professors` table (unique profileUrl)
-- - `faculty_staff` stores `professorId` and keeps all categories
-- - new tables for teachings/publications/academic contributions

-- 1) CreateTable: professors
CREATE TABLE `professors` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `profileUrl` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NULL,
  `avatarUrl` VARCHAR(191) NULL,
  `biographyHtml` LONGTEXT NULL,
  `biographyUpdatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `professors_profileUrl_key`(`profileUrl`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) CreateTable: professor_teachings
CREATE TABLE `professor_teachings` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `professorId` INTEGER NOT NULL,
  `unit` VARCHAR(191) NULL,
  `programName` VARCHAR(191) NULL,
  `programType` VARCHAR(191) NULL,
  `semester` INTEGER NULL,
  `subjectName` VARCHAR(191) NULL,
  `subjectCode` VARCHAR(191) NULL,
  `pXgp` DOUBLE NULL,
  `vXgv` DOUBLE NULL,
  `lXgl` DOUBLE NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `professor_teachings_professorId_idx`(`professorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3) CreateTable: professor_selected_publications
CREATE TABLE `professor_selected_publications` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `professorId` INTEGER NOT NULL,
  `year` INTEGER NULL,
  `category` VARCHAR(191) NULL,
  `authors` VARCHAR(191) NULL,
  `title` VARCHAR(191) NULL,
  `source` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `professor_selected_publications_professorId_idx`(`professorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4) CreateTable: professor_academic_contributions
CREATE TABLE `professor_academic_contributions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `professorId` INTEGER NOT NULL,
  `contributionGroup` VARCHAR(191) NULL,
  `bibliographicValue` VARCHAR(191) NULL,
  `year` INTEGER NULL,
  `ucgAuthors` VARCHAR(191) NULL,
  `details` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `professor_academic_contributions_professorId_idx`(`professorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 5) Add columns + migrate faculty_staff rows
-- Add professorId column (nullable initially).
ALTER TABLE `faculty_staff` ADD COLUMN `professorId` INTEGER NULL;

-- Populate professors from existing faculty_staff.profileUrl/name/email/avatarUrl (best-effort).
INSERT INTO `professors` (`profileUrl`, `name`, `email`, `avatarUrl`, `createdAt`, `updatedAt`)
SELECT
  fs.`profileUrl`,
  fs.`name`,
  fs.`email`,
  fs.`avatarUrl`,
  NOW(3),
  NOW(3)
FROM `faculty_staff` fs
WHERE fs.`profileUrl` IS NOT NULL;

-- Remove old unique constraint that prevented multiple categories per professor.
ALTER TABLE `faculty_staff` DROP INDEX `faculty_staff_profileUrl_key`;

-- The Prisma `FacultyStaff` model no longer stores profileUrl directly
-- (it is stored on `professors`). Make the legacy column nullable so inserts
-- that only provide `(facultyId, professorId, category)` succeed.
ALTER TABLE `faculty_staff` MODIFY `profileUrl` VARCHAR(191) NULL;

-- Ensure category is non-null (Prisma model requires String for category).
UPDATE `faculty_staff` SET `category` = '' WHERE `category` IS NULL;
ALTER TABLE `faculty_staff` MODIFY `category` VARCHAR(191) NOT NULL;

-- Update faculty_staff.professorId based on profileUrl
UPDATE `faculty_staff` fs
JOIN `professors` p ON p.`profileUrl` = fs.`profileUrl`
SET fs.`professorId` = p.`id`;

-- Make professorId required now that data is backfilled.
ALTER TABLE `faculty_staff` MODIFY `professorId` INTEGER NOT NULL;

-- Create the new unique composite key: (facultyId, professorId, category)
ALTER TABLE `faculty_staff`
  ADD UNIQUE INDEX `faculty_staff_facultyId_professorId_category_key`(`facultyId`, `professorId`, `category`);

-- 6) Foreign keys
ALTER TABLE `professor_teachings`
  ADD CONSTRAINT `professor_teachings_professorId_fkey`
  FOREIGN KEY (`professorId`) REFERENCES `professors`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `professor_selected_publications`
  ADD CONSTRAINT `professor_selected_publications_professorId_fkey`
  FOREIGN KEY (`professorId`) REFERENCES `professors`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `professor_academic_contributions`
  ADD CONSTRAINT `professor_academic_contributions_professorId_fkey`
  FOREIGN KEY (`professorId`) REFERENCES `professors`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `faculty_staff`
  ADD CONSTRAINT `faculty_staff_professorId_fkey`
  FOREIGN KEY (`professorId`) REFERENCES `professors`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Note:
-- We keep legacy columns on `faculty_staff` (profileUrl/name/email/avatarUrl) as extra fields.
-- Prisma ignores unknown columns; the important part is that we removed the old unique constraint
-- and introduced `professorId` + the new composite uniqueness.

