-- Draft boards: position group + league + year, sorted by overall.
CREATE INDEX "Player_positionGroup_league_year_overall_idx"
ON "Player"("positionGroup", "league", "year", "overall");

-- Club pools and catalog DISTINCT league/year lookups.
CREATE INDEX "Player_league_year_club_idx"
ON "Player"("league", "year", "club");
