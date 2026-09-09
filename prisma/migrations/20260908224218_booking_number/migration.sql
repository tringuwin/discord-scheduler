-- Per-guild human-facing booking numbers.

-- AlterTable: monotonic per-guild counter.
ALTER TABLE "Guild" ADD COLUMN "bookingSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: the booking's number (nullable; assigned on confirm).
ALTER TABLE "Booking" ADD COLUMN "number" INTEGER;

-- CreateIndex: a number is unique within its guild (NULLs are distinct in SQLite).
CREATE UNIQUE INDEX "Booking_guildId_number_key" ON "Booking"("guildId", "number");
