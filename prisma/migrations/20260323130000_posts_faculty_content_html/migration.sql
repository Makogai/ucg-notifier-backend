-- Extend posts for faculty-level sections and full content storage

ALTER TABLE `posts`
  ADD COLUMN `contentHtml` LONGTEXT NULL,
  ADD COLUMN `facultyId` INTEGER NULL;

ALTER TABLE `posts`
  MODIFY `content` LONGTEXT NULL;

ALTER TABLE `posts`
  ADD CONSTRAINT `posts_facultyId_fkey`
  FOREIGN KEY (`facultyId`) REFERENCES `faculties`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `posts_facultyId_idx` ON `posts`(`facultyId`);

