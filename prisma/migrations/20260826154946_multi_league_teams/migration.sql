/*
  Warnings:

  - Added the required column `draftId` to the `Coach` table without a default value. This is not possible if the table is not empty.
  - Added the required column `draftId` to the `Team` table without a default value. This is not possible if the table is not empty.
  - Added the required column `league` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Coach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draftId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "clubId" INTEGER,
    "rating" INTEGER NOT NULL,
    CONSTRAINT "Coach_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Coach" ("club", "clubId", "id", "name", "rating") SELECT "club", "clubId", "id", "name", "rating" FROM "Coach";
DROP TABLE "Coach";
ALTER TABLE "new_Coach" RENAME TO "Coach";
CREATE UNIQUE INDEX "Coach_draftId_name_key" ON "Coach"("draftId", "name");
CREATE TABLE "new_Draft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userTeamId" INTEGER,
    "leagues" TEXT NOT NULL DEFAULT 'Premier League',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'selecting_team',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Draft_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Draft" ("createdAt", "currentPick", "id", "status", "userTeamId") SELECT "createdAt", "currentPick", "id", "status", "userTeamId" FROM "Draft";
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
    CONSTRAINT "Team_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("draftOrder", "id", "name", "shortName", "slug") SELECT "draftOrder", "id", "name", "shortName", "slug" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_draftId_draftOrder_key" ON "Team"("draftId", "draftOrder");
CREATE UNIQUE INDEX "Team_draftId_slug_key" ON "Team"("draftId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
