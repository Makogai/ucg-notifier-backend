-- Fix: legacy `faculty_staff.name` column must be nullable
-- because Prisma model no longer writes it (it lives on `professors`).
ALTER TABLE `faculty_staff` MODIFY `name` VARCHAR(191) NULL;

