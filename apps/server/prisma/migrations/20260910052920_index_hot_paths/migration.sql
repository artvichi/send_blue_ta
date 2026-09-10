-- DropIndex
DROP INDEX "messages_status_forceDispatch_scheduledAt_priority_queueSeq_idx";

-- CreateIndex
CREATE INDEX "messages_status_forceDispatch_queueSeq_idx" ON "messages"("status", "forceDispatch" DESC, "queueSeq");

-- CreateIndex
CREATE INDEX "messages_status_forceDispatch_scheduledAt_priority_queueSeq_idx" ON "messages"("status", "forceDispatch" DESC, "scheduledAt", "priority", "queueSeq");

-- CreateIndex
CREATE INDEX "messages_dispatchedAt_idx" ON "messages"("dispatchedAt" DESC);

-- CreateIndex
CREATE INDEX "messages_createdAt_id_idx" ON "messages"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "messages_status_createdAt_idx" ON "messages"("status", "createdAt" DESC);
