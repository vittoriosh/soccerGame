-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "sofifaId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "positions" TEXT NOT NULL,
    "positionGroup" TEXT NOT NULL DEFAULT 'MID',
    "nationality" TEXT NOT NULL,
    "club" TEXT NOT NULL DEFAULT '',
    "clubId" INTEGER,
    "league" TEXT NOT NULL DEFAULT '',
    "overall" INTEGER NOT NULL,
    "potential" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "dob" TEXT NOT NULL,
    "heightCm" INTEGER NOT NULL,
    "weightKg" INTEGER NOT NULL,
    "valueEur" INTEGER NOT NULL,
    "wageEur" INTEGER NOT NULL,
    "preferredFoot" TEXT NOT NULL,
    "weakFoot" INTEGER NOT NULL,
    "skillMoves" INTEGER NOT NULL,
    "internationalReputation" INTEGER NOT NULL,
    "workRate" TEXT NOT NULL,
    "pace" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "dribbling" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "physic" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "attackingCrossing" INTEGER NOT NULL,
    "attackingFinishing" INTEGER NOT NULL,
    "attackingHeadingAccuracy" INTEGER NOT NULL,
    "attackingShortPassing" INTEGER NOT NULL,
    "attackingVolleys" INTEGER NOT NULL,
    "skillDribbling" INTEGER NOT NULL,
    "skillCurve" INTEGER NOT NULL,
    "skillFkAccuracy" INTEGER NOT NULL,
    "skillLongPassing" INTEGER NOT NULL,
    "skillBallControl" INTEGER NOT NULL,
    "movementAcceleration" INTEGER NOT NULL,
    "movementSprintSpeed" INTEGER NOT NULL,
    "movementAgility" INTEGER NOT NULL,
    "movementReactions" INTEGER NOT NULL,
    "movementBalance" INTEGER NOT NULL,
    "powerShotPower" INTEGER NOT NULL,
    "powerJumping" INTEGER NOT NULL,
    "powerStamina" INTEGER NOT NULL,
    "powerStrength" INTEGER NOT NULL,
    "powerLongShots" INTEGER NOT NULL,
    "mentalityAggression" INTEGER NOT NULL,
    "mentalityInterceptions" INTEGER NOT NULL,
    "mentalityPositioning" INTEGER NOT NULL,
    "mentalityVision" INTEGER NOT NULL,
    "mentalityPenalties" INTEGER NOT NULL,
    "mentalityComposure" INTEGER NOT NULL,
    "defendingMarkingAwareness" INTEGER NOT NULL,
    "defendingStandingTackle" INTEGER NOT NULL,
    "defendingSlidingTackle" INTEGER NOT NULL,
    "goalkeepingDiving" INTEGER NOT NULL,
    "goalkeepingHandling" INTEGER NOT NULL,
    "goalkeepingKicking" INTEGER NOT NULL,
    "goalkeepingPositioning" INTEGER NOT NULL,
    "goalkeepingReflexes" INTEGER NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "league" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draftOrder" INTEGER NOT NULL,
    "clubId" INTEGER,
    "formation" TEXT NOT NULL DEFAULT '4-3-3',

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" SERIAL NOT NULL,
    "userTeamId" INTEGER,
    "leagues" TEXT NOT NULL DEFAULT 'Premier League',
    "years" TEXT NOT NULL DEFAULT '2026',
    "formation" TEXT NOT NULL DEFAULT '4-3-3',
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'selecting_team',
    "cardPacksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "chemistryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "coachEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "potentialEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fitEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "club" TEXT NOT NULL,
    "clubId" INTEGER,
    "rating" INTEGER NOT NULL,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachPick" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "coachId" INTEGER NOT NULL,

    CONSTRAINT "CoachPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "slotId" TEXT,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardPack" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "tradedPlayerId" INTEGER NOT NULL,
    "candidateIds" TEXT NOT NULL,
    "chosenPlayerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackRun" (
    "id" SERIAL NOT NULL,
    "cash" INTEGER NOT NULL DEFAULT 10000,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "coachName" TEXT,
    "coachClub" TEXT,
    "coachClubId" INTEGER,
    "coachRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackOpening" (
    "id" SERIAL NOT NULL,
    "packRunId" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "candidates" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackPlayer" (
    "id" SERIAL NOT NULL,
    "packRunId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "positionGroup" TEXT NOT NULL,
    "color" TEXT,
    "boost" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_overall_idx" ON "Player"("overall");

-- CreateIndex
CREATE INDEX "Player_positions_idx" ON "Player"("positions");

-- CreateIndex
CREATE INDEX "Player_positionGroup_idx" ON "Player"("positionGroup");

-- CreateIndex
CREATE INDEX "Player_year_idx" ON "Player"("year");

-- CreateIndex
CREATE INDEX "Player_positionGroup_league_overall_idx" ON "Player"("positionGroup", "league", "overall");

-- CreateIndex
CREATE INDEX "Player_club_idx" ON "Player"("club");

-- CreateIndex
CREATE INDEX "Player_nationality_idx" ON "Player"("nationality");

-- CreateIndex
CREATE UNIQUE INDEX "Player_sofifaId_year_key" ON "Player"("sofifaId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Team_draftId_draftOrder_key" ON "Team"("draftId", "draftOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Team_draftId_slug_key" ON "Team"("draftId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_userTeamId_key" ON "Draft"("userTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "Coach_draftId_name_key" ON "Coach"("draftId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_pickNumber_key" ON "CoachPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_coachId_key" ON "CoachPick"("draftId", "coachId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPick_draftId_teamId_key" ON "CoachPick"("draftId", "teamId");

-- CreateIndex
CREATE INDEX "DraftPick_draftId_teamId_idx" ON "DraftPick"("draftId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_pickNumber_key" ON "DraftPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_playerId_key" ON "DraftPick"("draftId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_teamId_slotId_key" ON "DraftPick"("draftId", "teamId", "slotId");

-- CreateIndex
CREATE INDEX "CardPack_draftId_teamId_idx" ON "CardPack"("draftId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPack_draftId_tradedPlayerId_key" ON "CardPack"("draftId", "tradedPlayerId");

-- CreateIndex
CREATE INDEX "PackOpening_packRunId_idx" ON "PackOpening"("packRunId");

-- CreateIndex
CREATE INDEX "PackPlayer_packRunId_idx" ON "PackPlayer"("packRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PackPlayer_packRunId_playerId_key" ON "PackPlayer"("packRunId", "playerId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userTeamId_fkey" FOREIGN KEY ("userTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPick" ADD CONSTRAINT "CoachPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPick" ADD CONSTRAINT "CoachPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPick" ADD CONSTRAINT "CoachPick_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPack" ADD CONSTRAINT "CardPack_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardPack" ADD CONSTRAINT "CardPack_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_packRunId_fkey" FOREIGN KEY ("packRunId") REFERENCES "PackRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackPlayer" ADD CONSTRAINT "PackPlayer_packRunId_fkey" FOREIGN KEY ("packRunId") REFERENCES "PackRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

