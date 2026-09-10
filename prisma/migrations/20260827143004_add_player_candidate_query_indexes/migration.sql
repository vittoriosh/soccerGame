-- CreateIndex
CREATE INDEX "Player_positionGroup_league_overall_idx" ON "Player"("positionGroup", "league", "overall");

-- CreateIndex
CREATE INDEX "Player_club_idx" ON "Player"("club");

-- CreateIndex
CREATE INDEX "Player_nationality_idx" ON "Player"("nationality");
