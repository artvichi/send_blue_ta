-- AlterTable
ALTER TABLE "gateway_heartbeats" ADD COLUMN     "automation" BOOLEAN,
ADD COLUMN     "fullDiskAccess" BOOLEAN,
ADD COLUMN     "hostApp" TEXT;
