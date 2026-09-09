-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'DISPATCHING', 'ACCEPTED', 'SENT', 'DELIVERED', 'RECEIVED', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "queueSeq" BIGSERIAL NOT NULL,
    "toE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduledAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dispatchToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerGuid" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_events" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "detail" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sendIntervalSeconds" INTEGER NOT NULL DEFAULT 3600,
    "policy" TEXT NOT NULL DEFAULT 'FIFO',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_heartbeats" (
    "id" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_dispatchToken_key" ON "messages"("dispatchToken");

-- CreateIndex
CREATE UNIQUE INDEX "messages_providerGuid_key" ON "messages"("providerGuid");

-- CreateIndex
CREATE INDEX "messages_status_scheduledAt_priority_queueSeq_idx" ON "messages"("status", "scheduledAt", "priority", "queueSeq");

-- CreateIndex
CREATE INDEX "messages_status_leaseExpiresAt_idx" ON "messages"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "message_events_messageId_occurredAt_idx" ON "message_events"("messageId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "message_events_messageId_status_key" ON "message_events"("messageId", "status");

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
