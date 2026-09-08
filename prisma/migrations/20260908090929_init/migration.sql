-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminRoleId" TEXT,
    "categoryId" TEXT,
    "defaultTz" TEXT NOT NULL DEFAULT 'UTC',
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPref" (
    "discordId" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "tz" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AvailabilityRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlotReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "startUtc" DATETIME NOT NULL,
    "bookingId" TEXT NOT NULL,
    CONSTRAINT "SlotReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'accepted',

    PRIMARY KEY ("bookingId", "userId"),
    CONSTRAINT "Participant_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingChannel" (
    "bookingId" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "everJoined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingChannel_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AvailabilityRule_guildId_adminId_idx" ON "AvailabilityRule"("guildId", "adminId");

-- CreateIndex
CREATE INDEX "Booking_guildId_startUtc_idx" ON "Booking"("guildId", "startUtc");

-- CreateIndex
CREATE INDEX "Booking_status_startUtc_idx" ON "Booking"("status", "startUtc");

-- CreateIndex
CREATE UNIQUE INDEX "SlotReservation_adminId_startUtc_key" ON "SlotReservation"("adminId", "startUtc");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingChannel_channelId_key" ON "MeetingChannel"("channelId");
