-- Store professor biography also as plain text + widen contribution fields to LONGTEXT

ALTER TABLE `professors`
  ADD COLUMN `biographyText` LONGTEXT NULL;

-- Make biographyHtml a LONGTEXT (it should already be from earlier migration,
-- but this keeps schema consistent).
ALTER TABLE `professors` MODIFY `biographyHtml` LONGTEXT NULL;

-- Widen academic contributions string columns.
ALTER TABLE `professor_academic_contributions`
  MODIFY `contributionGroup` LONGTEXT NULL,
  MODIFY `bibliographicValue` LONGTEXT NULL,
  MODIFY `ucgAuthors` LONGTEXT NULL,
  MODIFY `details` LONGTEXT NULL;

