-- AlterTable
ALTER TABLE "DraftPick" ADD COLUMN "slotId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Draft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userTeamId" INTEGER,
    "leagues" TEXT NOT NULL DEFAULT 'Premier League',
    "years" TEXT NOT NULL DEFAULT '2026',
    "formation" TEXT NOT NULL DEFAULT '4-3-3',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'selecting_team',
    "cardPacksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Draft_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Draft" ("cardPacksEnabled", "createdAt", "currentPick", "id", "leagues", "status", "userTeamId", "years") SELECT "cardPacksEnabled", "createdAt", "currentPick", "id", "leagues", "status", "userTeamId", "years" FROM "Draft";
DROP TABLE "Draft";
ALTER TABLE "new_Draft" RENAME TO "Draft";
CREATE UNIQUE INDEX "Draft_userTeamId_key" ON "Draft"("userTeamId");
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draftId" INTEGER NOT NULL,
    "league" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draftOrder" INTEGER NOT NULL,
    "clubId" INTEGER,
    "formation" TEXT NOT NULL DEFAULT '4-3-3',
    CONSTRAINT "Team_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("draftId", "draftOrder", "id", "league", "name", "shortName", "slug") SELECT "draftId", "draftOrder", "id", "league", "name", "shortName", "slug" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_draftId_draftOrder_key" ON "Team"("draftId", "draftOrder");
CREATE UNIQUE INDEX "Team_draftId_slug_key" ON "Team"("draftId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_teamId_slotId_key" ON "DraftPick"("draftId", "teamId", "slotId");

