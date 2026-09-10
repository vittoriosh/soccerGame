-- CreateTable
CREATE TABLE "PackRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cash" INTEGER NOT NULL DEFAULT 10000,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "coachName" TEXT,
    "coachClub" TEXT,
    "coachClubId" INTEGER,
    "coachRating" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "packRunId" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "candidates" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackOpening_packRunId_fkey" FOREIGN KEY ("packRunId") REFERENCES "PackRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackPlayer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "packRunId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "positionGroup" TEXT NOT NULL,
    "color" TEXT,
    "boost" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PackPlayer_packRunId_fkey" FOREIGN KEY ("packRunId") REFERENCES "PackRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PackOpening_packRunId_idx" ON "PackOpening"("packRunId");

-- CreateIndex
CREATE INDEX "PackPlayer_packRunId_idx" ON "PackPlayer"("packRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PackPlayer_packRunId_playerId_key" ON "PackPlayer"("packRunId", "playerId");
