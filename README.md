# Matchday Manager

A soccer draft and squad-building game built with Next.js, Prisma, and Postgres.

## Local development

1. Create a Postgres database (Neon, Vercel Postgres, or local Docker).
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
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

1. Create a Vercel Postgres (or Neon) database.
2. Attach it so the project gets `DATABASE_URL` for **Production**, **Preview**, and **Development**.
3. Deploy. The build runs `prisma migrate deploy` then `next build`.
4. Seed the remote database once from your machine:

```bash
DATABASE_URL="your-production-url" npm run db:seed
```

SQLite is no longer used. Vercel’s serverless filesystem cannot host a durable SQLite file.
