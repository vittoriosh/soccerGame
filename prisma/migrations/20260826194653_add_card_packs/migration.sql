-- CreateTable
CREATE TABLE "CardPack" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draftId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "tradedPlayerId" INTEGER NOT NULL,
    "candidateIds" TEXT NOT NULL,
    "chosenPlayerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardPack_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardPack_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Draft" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userTeamId" INTEGER,
    "leagues" TEXT NOT NULL DEFAULT 'Premier League',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'selecting_team',
    "cardPacksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Draft_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Draft" ("createdAt", "currentPick", "id", "leagues", "status", "userTeamId") SELECT "createdAt", "currentPick", "id", "leagues", "status", "userTeamId" FROM "Draft";
DROP TABLE "Draft";
ALTER TABLE "new_Draft" RENAME TO "Draft";
CREATE UNIQUE INDEX "Draft_userTeamId_key" ON "Draft"("userTeamId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CardPack_draftId_teamId_idx" ON "CardPack"("draftId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPack_draftId_tradedPlayerId_key" ON "CardPack"("draftId", "tradedPlayerId");
