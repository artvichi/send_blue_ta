-- The column now holds either an E.164 phone number or an Apple ID email, so
-- its old name no longer described its contents. A rename keeps existing rows;
-- Prisma's inferred diff would have dropped and re-added the column.
ALTER TABLE "messages" RENAME COLUMN "toE164" TO "toHandle";
