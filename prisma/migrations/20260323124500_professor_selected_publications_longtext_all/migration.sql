-- Widen columns for selected publications (authors/title/source/category)

ALTER TABLE `professor_selected_publications`
  MODIFY `category` LONGTEXT NULL,
  MODIFY `authors` LONGTEXT NULL,
  MODIFY `title` LONGTEXT NULL,
  MODIFY `source` LONGTEXT NULL;

