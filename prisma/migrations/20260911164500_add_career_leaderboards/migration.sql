ALTER TABLE "Draft"
ADD COLUMN "username" TEXT,
ADD COLUMN "careerKey" TEXT;

CREATE INDEX "Draft_careerKey_idx" ON "Draft"("careerKey");

CREATE TABLE "CareerResult" (
  "id" SERIAL NOT NULL,
  "draftId" INTEGER NOT NULL,
  "careerKey" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "gameMode" TEXT NOT NULL,
  "division" INTEGER NOT NULL,
  "seasonNumber" INTEGER NOT NULL,
  "teamName" TEXT NOT NULL,
  "teamScore" DOUBLE PRECISION NOT NULL,
  "fieldRank" INTEGER NOT NULL,
  "fieldSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CareerResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CareerResult_draftId_key" ON "CareerResult"("draftId");
CREATE INDEX "CareerResult_gameMode_division_teamScore_idx"
ON "CareerResult"("gameMode", "division", "teamScore");
CREATE INDEX "CareerResult_careerKey_seasonNumber_idx"
ON "CareerResult"("careerKey", "seasonNumber");

ALTER TABLE "CareerResult"
ADD CONSTRAINT "CareerResult_draftId_fkey"
FOREIGN KEY ("draftId") REFERENCES "Draft"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
