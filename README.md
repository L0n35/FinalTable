# Final Table

A mobile-first web app where players rank a league's teams before its deadline, then follow a live leaderboard through the season. See [SPEC.md](SPEC.md) for the full product spec.

Built with Next.js, TypeScript, Tailwind CSS and Supabase.

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
