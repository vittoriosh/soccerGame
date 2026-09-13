# Matchday Manager

A soccer draft and squad-building game built with Next.js, Prisma, and Postgres.

## Local development

1. Create a Postgres database (Supabase is the default hosted option).
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to the **session pooler** string (port 5432).
3. Install and prepare the database:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Seeding needs the player CSV files in `/data` (see `.gitignore` notes).

## Release check

```bash
npm run check
```

This runs ESLint, TypeScript, and the optimized Next.js production build.

## Production / Vercel

1. Create a Supabase Postgres database (or Neon / local Docker).
2. Set `DATABASE_URL` on Vercel for **Production**, **Preview**, and **Development**. If you use the transaction pooler (port 6543), also set `DIRECT_URL` to the session/direct string (port 5432) so `prisma migrate deploy` can run.
3. Deploy. The build runs `prisma migrate deploy` then `next build`.
4. Seed the remote database once from your machine, or restore a dump:

```bash
DATABASE_URL="your-production-url" npm run db:seed
npm run db:restore
```

SQLite is no longer used. Vercel’s serverless filesystem cannot host a durable SQLite file.
