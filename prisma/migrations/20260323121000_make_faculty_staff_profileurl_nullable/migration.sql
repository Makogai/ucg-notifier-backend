-- Fix: legacy `faculty_staff.profileUrl` column must be nullable
-- because Prisma model no longer writes it (it lives on `professors`).
ALTER TABLE `faculty_staff` MODIFY `profileUrl` VARCHAR(191) NULL;

