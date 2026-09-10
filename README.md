# Matchday Manager

A soccer draft and squad-building game built with Next.js, Prisma, and SQLite.

## Local development

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Release check

Run the complete release gate before deploying:

```bash
npm run check
```

This runs ESLint, TypeScript, and the optimized Next.js production build.

## Production

This app uses SQLite and must run on a persistent, single-writer filesystem.
It is not suitable for ephemeral/serverless storage without replacing SQLite.

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

Set `DATABASE_URL` to an absolute persistent path in production:

```bash
DATABASE_URL=file:/var/lib/matchday-manager/game.db
```

The database directory must exist and be writable by the application user.
Back up the SQLite database before applying migrations.

## Vercel

Set `DATABASE_URL` in the Vercel project environment variables so installs and
runtime share the same connection string.

SQLite file databases do **not** work on Vercel’s serverless filesystem. For a
hosted deploy, use a remote database (for example Postgres/Neon/Turso) and set
`DATABASE_URL` to that connection string. `prisma generate` no longer requires
the variable at install time, but the running app still does.
