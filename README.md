# Final Table

A mobile-first web app where players rank a league's teams before its deadline, then follow a live leaderboard through the season. See [SPEC.md](SPEC.md) for the full product spec.

**Live: [final-table-lovat.vercel.app](https://final-table-lovat.vercel.app)**

Built with Next.js, TypeScript, Tailwind CSS and Supabase.

## Why I built this

It started as a game with friends: everyone ranks the Premier League table before the season starts, then we see who called it. Final Table turns that into something anyone can run, for any league in any sport, from a link they share. My friends' 2026–27 Premier League tables are already in it.

## Key decisions

- **The ranking screen came first.** Putting 20 teams in order on a phone is the make-or-break moment, so I built it before anything else and tested it on real phones. Only the drag handle starts a drag, so scrolling and dragging never fight, and tap-to-place works with no drag library at all. The library (`@dnd-kit/react`, still pre-1.0) is pinned to an exact version and sits behind a simple `order` / `onChange` interface, so it can be swapped out.
- **The database enforces the rules, not the browser.** Row-level security and database functions block predictions after the deadline, hide other players' picks until then, check every table has each team exactly once, and only let the scoring function write scores. Each rule has a test that runs the real schema on an in-process Postgres, so `npm test` needs no accounts or Docker.
- **Deadlines use the database clock, not a scheduled job.** A league locks by comparing its deadline with the database time whenever data is read or written, so it happens exactly on time. Vercel's free cron can run up to 59 minutes late, so it only does a daily keep-alive.
- **No sports data feed.** The league's creator, or an admin for global leagues, updates the standings. That's a manual step, but it's what lets any league in any sport work.
- **Built to run on free tiers.** Public pages are built ahead and refreshed at most every 15 minutes, so visitors don't hit the database. Scoring runs inside Postgres, and a nightly GitHub Action saves an encrypted backup because Supabase's free plan has none.
- **Private by default.** Player counts and the crowd's favourite pick only appear once a league has 10 players, rounded to the nearest 5%, so nobody in a small group can work out who picked what.
- **Google sign-in only, for now.** It keeps the first release simple, but leaves out anyone without a Google account. Google also blocks sign-in inside some apps' built-in browsers, such as Instagram and TikTok, so the app spots those and asks people to open the link in their normal browser.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app at http://localhost:3000 |
| `npm test` | Runs the database security tests and unit tests, with no accounts or Docker needed |
| `npm run lint` | Checks the code style |
| `npm run build` | Creates a production build |

## Setup

The app runs without any accounts, but sign-in stays off until you complete these steps. The ranking demo is at `/demo`.

### 1. Create the Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run each file in [supabase/migrations](supabase/migrations) in date order, pasting in the whole file each time. Run each file only once.
3. Copy `.env.example` to `.env.local`, then add the project URL and publishable key from the project's API settings. Never put a secret or service role key in this file.

### 2. Set up Google sign-in

1. In **Supabase > Authentication > Providers > Google**, copy the callback URL shown there.
2. In [Google Cloud Console](https://console.cloud.google.com), create a project and open **Google Auth Platform**. Complete the consent screen, adding the `openid` scope under **Data Access**.
3. Under **Clients**, create a **Web application** client:
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** the Supabase callback URL
4. Paste the client ID and client secret into the Supabase Google provider page, enable it and save.
5. In **Supabase > Authentication > URL Configuration**, set **Site URL** to `http://localhost:3000` and add `http://localhost:3000/**` to the redirect URLs.

### 3. Check it works

Run `npm run dev`, open http://localhost:3000 and sign in. The home page should show your Google name.

### 4. Make yourself an admin

After signing in once, run this in the Supabase SQL Editor, using your own Google account's email:

```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

### 5. Go live on Vercel

Supabase only returns people to addresses it knows, and sends everyone else to the Site URL. In **Supabase > Authentication > URL Configuration**:

- Set **Site URL** to the live address.
- Under redirect URLs, keep `http://localhost:3000/**` and add the live address followed by `/**`.
- For branch previews, add `https://final-table-git-*-<your-vercel-team>.vercel.app/**`. Previews use the same database as the live site, so anything created on one is real.

## Launch content

After the migrations, run [supabase/seed/launch-leagues.sql](supabase/seed/launch-leagues.sql) once in the SQL Editor. It adds the global leagues with their teams and colours, plus the coming-soon list. It stops without changing anything if a season already exists.

A database seeded before conferences existed has MLS East and MLS West as separate leagues. Once the conferences migration has run and its code is deployed, run [supabase/seed/merge-conferences.sql](supabase/seed/merge-conferences.sql) once to combine them. A new database doesn't need it.

Anything in `supabase/private/` is git-ignored because it holds personal data, so it must never be committed.

## Sports and their grounds

Each sport plays on its own ground: a surface in the league's colour, a chalk boundary and one marking only that sport has. `surfaceFor()` in [src/lib/leagues.ts](src/lib/leagues.ts) picks it from the sport's name, and the grounds are in [src/app/globals.css](src/app/globals.css) under `data-surface`. Motorsport already has one, so adding F1 only needs its competition and teams. A sport with no ground of its own gets a plain one, so to design a new one, add it to both places.

## Cached pages

The home and Explore pages read the database when the site is built, so run new migrations before deploying. If those reads fail, the build fails and the live site stays as it was, rather than publishing an empty page.

After that they refresh at most every 15 minutes. Publishing, hiding, deleting, renaming or finishing a league refreshes them straight away. Joining and predicting don't, because that would clear the cache on every prediction. Reading new shared data on those pages means adding it in [src/lib/directory.ts](src/lib/directory.ts).

## Backups

[.github/workflows/backup.yml](.github/workflows/backup.yml) saves an encrypted copy of the database every night and keeps it for 14 days. Logo files aren't included. To turn it on, add two secrets under **GitHub > Settings > Secrets and variables > Actions**:

- `SUPABASE_DB_URL`: the **Session pooler** connection string from the Supabase **Connect** dialog, with your database password filled in. GitHub's runners can't reach the direct connection.
- `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy somewhere safe, because the backups can't be opened without it.

Then run **Database backup** once from the **Actions** tab to check it works. GitHub pauses scheduled workflows after 60 days without a commit, and emails you before it does.

To restore, download the file from the workflow run, then:

```bash
gpg --decrypt backup.dump.gpg > backup.dump
pg_restore --no-owner --dbname "YOUR_DB_URL" backup.dump
```

Try a restore on a spare project first, because it writes to whichever database you point it at.

## Project layout

| Path | Contents |
|---|---|
| `src/app` | Pages and routes |
| `src/components` | Interface components, including the ranking list |
| `src/lib` | Shared logic and Supabase clients |
| `src/proxy.ts` | Refreshes the sign-in session on each request |
| `supabase/migrations` | Database schema and security rules |
| `supabase/tests` | Tests that run the real schema on an in-process Postgres |
