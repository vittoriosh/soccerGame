ALTER TABLE "Draft"
ADD COLUMN "divisionsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "division" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "seasonNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "previousSeasonDraftId" INTEGER;

CREATE UNIQUE INDEX "Draft_previousSeasonDraftId_key"
ON "Draft"("previousSeasonDraftId");

ALTER TABLE "Draft"
ADD CONSTRAINT "Draft_previousSeasonDraftId_fkey"
FOREIGN KEY ("previousSeasonDraftId") REFERENCES "Draft"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
