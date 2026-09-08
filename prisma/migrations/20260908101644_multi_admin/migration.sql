/*
  Warnings:

  - You are about to drop the column `adminId` on the `Booking` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "startUtc" DATETIME NOT NULL,
    "endUtc" DATETIME NOT NULL,
    "reminded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "endUtc", "guildId", "id", "organizerId", "reminded", "startUtc", "status") SELECT "createdAt", "endUtc", "guildId", "id", "organizerId", "reminded", "startUtc", "status" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_guildId_startUtc_idx" ON "Booking"("guildId", "startUtc");
CREATE INDEX "Booking_status_startUtc_idx" ON "Booking"("status", "startUtc");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
