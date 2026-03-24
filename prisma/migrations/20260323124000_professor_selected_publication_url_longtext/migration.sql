-- Add selected publication link URL

ALTER TABLE `professor_selected_publications`
  ADD COLUMN `url` LONGTEXT NULL;

