/*
  Timezone configuration removed — the app now schedules and displays entirely
  in Pacific time. Drops the per-user timezone table and the per-guild default.
*/

-- DropTable
DROP TABLE "UserPref";

-- RedefineTables (drop Guild.defaultTz)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminRoleId" TEXT,
    "categoryId" TEXT,
    "slotMinutes" INTEGER NOT NULL DEFAULT 30,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Guild" ("adminRoleId", "categoryId", "createdAt", "id", "reminderMinutes", "slotMinutes", "updatedAt") SELECT "adminRoleId", "categoryId", "createdAt", "id", "reminderMinutes", "slotMinutes", "updatedAt" FROM "Guild";
DROP TABLE "Guild";
ALTER TABLE "new_Guild" RENAME TO "Guild";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
