-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Draft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userTeamId" INTEGER,
    "leagues" TEXT NOT NULL DEFAULT 'Premier League',
    "years" TEXT NOT NULL DEFAULT '2026',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'selecting_team',
    "cardPacksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Draft_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Draft" ("cardPacksEnabled", "createdAt", "currentPick", "id", "leagues", "status", "userTeamId") SELECT "cardPacksEnabled", "createdAt", "currentPick", "id", "leagues", "status", "userTeamId" FROM "Draft";
DROP TABLE "Draft";
ALTER TABLE "new_Draft" RENAME TO "Draft";
CREATE UNIQUE INDEX "Draft_userTeamId_key" ON "Draft"("userTeamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
