-- Link ProfessorTeaching to Subject (nullable best-effort match).

ALTER TABLE `professor_teachings`
  ADD COLUMN `subjectId` INTEGER NULL;

ALTER TABLE `professor_teachings`
  ADD CONSTRAINT `professor_teachings_subjectId_fkey`
  FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `professor_teachings_subjectId_idx` ON `professor_teachings`(`subjectId`);

