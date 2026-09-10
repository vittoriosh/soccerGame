-- CreateTable
CREATE TABLE "Coach" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "rating" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "CoachPick" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draftId" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "coachId" INTEGER NOT NULL,
    CONSTRAINT "CoachPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CoachPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CoachPick_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Coach_name_key" ON "Coach"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_pickNumber_key" ON "CoachPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_coachId_key" ON "CoachPick"("draftId", "coachId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_teamId_key" ON "CoachPick"("draftId", "teamId");
