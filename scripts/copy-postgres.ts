/**
 * Dump or restore the full Postgres database without printing connection strings.
 *
 *   npx tsx --env-file=.env scripts/copy-postgres.ts dump
 *   npx tsx --env-file=.env scripts/copy-postgres.ts restore
 *   npx tsx --env-file=.env scripts/copy-postgres.ts restore --url "$SUPABASE_DATABASE_URL"
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DUMP_PATH = path.join(process.cwd(), "tmp", "prisma-export.dump");

function parsePostgresUrl(raw: string) {
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).split("?")[0];
  if (!url.hostname || !url.username || !database) {
    throw new Error("Connection string is missing host, user, or database name.");
  }
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    sslmode: url.searchParams.get("sslmode") ?? "require",
  };
}

function runPg(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function pgEnv(connectionString: string): NodeJS.ProcessEnv {
  const parsed = parsePostgresUrl(connectionString);
  return {
    ...process.env,
    PGHOST: parsed.host,
    PGPORT: parsed.port,
    PGUSER: parsed.user,
    PGPASSWORD: parsed.password,
    PGDATABASE: parsed.database,
    PGSSLMODE: parsed.sslmode,
  };
}

function connectionFromArgs(preferSource = false): string {
  const urlFlag = process.argv.find((arg) => arg.startsWith("--url="));
  const urlIndex = process.argv.indexOf("--url");
  const fromFlag = urlFlag?.slice("--url=".length)
    ?? (urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined);
  const raw = (
    fromFlag
    ?? (preferSource ? process.env.SOURCE_DATABASE_URL : undefined)
    ?? process.env.DIRECT_URL
    ?? process.env.DATABASE_URL
  )?.trim();
  if (!raw) {
    throw new Error("Set DATABASE_URL (or pass --url) before dumping or restoring.");
  }
  return raw;
}

async function dump() {
  mkdirSync(path.dirname(DUMP_PATH), { recursive: true });
  console.log(`Dumping current database to ${DUMP_PATH}…`);
  await runPg(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--file",
      DUMP_PATH,
    ],
    pgEnv(connectionFromArgs(true)),
  );
  console.log("Dump finished.");
}

async function restore() {
  const connectionString = connectionFromArgs();
  const parsed = parsePostgresUrl(connectionString);
  console.log(`Restoring ${DUMP_PATH} into the target database…`);
  await runPg(
    "pg_restore",
    [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--dbname",
      parsed.database,
      DUMP_PATH,
    ],
    pgEnv(connectionString),
  );
  console.log("Restore finished.");
}

async function main() {
  const command = process.argv[2];
  if (command === "dump") await dump();
  else if (command === "restore") await restore();
  else {
    throw new Error('Usage: tsx scripts/copy-postgres.ts dump|restore [--url <connection>]');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
