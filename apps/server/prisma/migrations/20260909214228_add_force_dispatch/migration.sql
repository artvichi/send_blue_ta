-- DropIndex
DROP INDEX "messages_status_scheduledAt_priority_queueSeq_idx";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "forceDispatch" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "messages_status_forceDispatch_scheduledAt_priority_queueSeq_idx" ON "messages"("status", "forceDispatch", "scheduledAt", "priority", "queueSeq");
