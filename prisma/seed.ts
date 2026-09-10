import "dotenv/config";
import { createReadStream } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { primaryPositionGroup } from "../src/lib/positions";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed. Set it to your Postgres connection string.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
// Both files share the same column layout (player_id, fifa_version, ...) —
// years are derived per-row from fifa_version, not hardcoded per file, so
// adding another file here (e.g. a future edition) needs no other changes.
const CSV_PATHS = [
  path.join(process.cwd(), "data", "players.csv"),
  path.join(process.cwd(), "data", "players-15-23.csv"),
];
const BATCH_SIZE = 500;

function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function toIntOrNull(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

type PlayerRow = {
  sofifaId: number;
  year: number;
  name: string;
  fullName: string;
  positions: string;
  positionGroup: string;
  nationality: string;
  club: string;
  clubId: number | null;
  league: string;
  overall: number;
  potential: number;
  age: number;
  dob: string;
  heightCm: number;
  weightKg: number;
  valueEur: number;
  wageEur: number;
  preferredFoot: string;
  weakFoot: number;
  skillMoves: number;
  internationalReputation: number;
  workRate: string;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physic: number;
  imageUrl: string;
  attackingCrossing: number;
  attackingFinishing: number;
  attackingHeadingAccuracy: number;
  attackingShortPassing: number;
  attackingVolleys: number;
  skillDribbling: number;
  skillCurve: number;
  skillFkAccuracy: number;
  skillLongPassing: number;
  skillBallControl: number;
  movementAcceleration: number;
  movementSprintSpeed: number;
  movementAgility: number;
  movementReactions: number;
  movementBalance: number;
  powerShotPower: number;
  powerJumping: number;
  powerStamina: number;
  powerStrength: number;
  powerLongShots: number;
  mentalityAggression: number;
  mentalityInterceptions: number;
  mentalityPositioning: number;
  mentalityVision: number;
  mentalityPenalties: number;
  mentalityComposure: number;
  defendingMarkingAwareness: number;
  defendingStandingTackle: number;
  defendingSlidingTackle: number;
  goalkeepingDiving: number;
  goalkeepingHandling: number;
  goalkeepingKicking: number;
  goalkeepingPositioning: number;
  goalkeepingReflexes: number;
};

function toPlayer(record: Record<string, string>): PlayerRow {
  return {
    sofifaId: toInt(record.player_id),
    year: 2000 + toInt(record.fifa_version),
    name: record.short_name,
    fullName: record.long_name,
    positions: record.player_positions,
    positionGroup: primaryPositionGroup(record.player_positions),
    nationality: record.nationality_name,
    club: record.club_name,
    clubId: toIntOrNull(record.club_team_id),
    league: record.league_name,
    overall: toInt(record.overall),
    potential: toInt(record.potential),
    age: toInt(record.age),
    dob: record.dob,
    heightCm: toInt(record.height_cm),
    weightKg: toInt(record.weight_kg),
    valueEur: toInt(record.value_eur),
    wageEur: toInt(record.wage_eur),
    preferredFoot: record.preferred_foot,
    weakFoot: toInt(record.weak_foot),
    skillMoves: toInt(record.skill_moves),
    internationalReputation: toInt(record.international_reputation),
    workRate: record.work_rate,
    pace: toInt(record.pace),
    shooting: toInt(record.shooting),
    passing: toInt(record.passing),
    dribbling: toInt(record.dribbling),
    defending: toInt(record.defending),
    physic: toInt(record.physic),
    imageUrl: record.player_face_url,
    attackingCrossing: toInt(record.attacking_crossing),
    attackingFinishing: toInt(record.attacking_finishing),
    attackingHeadingAccuracy: toInt(record.attacking_heading_accuracy),
    attackingShortPassing: toInt(record.attacking_short_passing),
    attackingVolleys: toInt(record.attacking_volleys),
    skillDribbling: toInt(record.skill_dribbling),
    skillCurve: toInt(record.skill_curve),
    skillFkAccuracy: toInt(record.skill_fk_accuracy),
    skillLongPassing: toInt(record.skill_long_passing),
    skillBallControl: toInt(record.skill_ball_control),
    movementAcceleration: toInt(record.movement_acceleration),
    movementSprintSpeed: toInt(record.movement_sprint_speed),
    movementAgility: toInt(record.movement_agility),
    movementReactions: toInt(record.movement_reactions),
    movementBalance: toInt(record.movement_balance),
    powerShotPower: toInt(record.power_shot_power),
    powerJumping: toInt(record.power_jumping),
    powerStamina: toInt(record.power_stamina),
    powerStrength: toInt(record.power_strength),
    powerLongShots: toInt(record.power_long_shots),
    mentalityAggression: toInt(record.mentality_aggression),
    mentalityInterceptions: toInt(record.mentality_interceptions),
    mentalityPositioning: toInt(record.mentality_positioning),
    mentalityVision: toInt(record.mentality_vision),
    mentalityPenalties: toInt(record.mentality_penalties),
    mentalityComposure: toInt(record.mentality_composure),
    defendingMarkingAwareness: toInt(record.defending_marking_awareness),
    defendingStandingTackle: toInt(record.defending_standing_tackle),
    defendingSlidingTackle: toInt(record.defending_sliding_tackle),
    goalkeepingDiving: toInt(record.goalkeeping_diving),
    goalkeepingHandling: toInt(record.goalkeeping_handling),
    goalkeepingKicking: toInt(record.goalkeeping_kicking),
    goalkeepingPositioning: toInt(record.goalkeeping_positioning),
    goalkeepingReflexes: toInt(record.goalkeeping_reflexes),
  };
}

async function main() {
  await prisma.player.deleteMany();

  let total = 0;

  for (const csvPath of CSV_PATHS) {
    let batch: PlayerRow[] = [];
    const parser = createReadStream(csvPath).pipe(
      parse({ columns: true, skip_empty_lines: true }),
    );

    for await (const record of parser) {
      batch.push(toPlayer(record as Record<string, string>));
      if (batch.length >= BATCH_SIZE) {
        await prisma.player.createMany({ data: batch });
        total += batch.length;
        process.stdout.write(`\rSeeded ${total} players...`);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await prisma.player.createMany({ data: batch });
      total += batch.length;
    }
  }

  console.log(`\nDone. Seeded ${total} players.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
