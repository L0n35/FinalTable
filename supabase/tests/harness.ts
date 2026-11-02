import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Stands in for the parts of Supabase the migrations rely on, so the real SQL runs in-process.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')::uuid;
  $$;
  grant execute on function auth.uid() to anon, authenticated;
`;

export type Db = {
  pg: PGlite;
  createUser: (name: string, options?: { admin?: boolean }) => Promise<string>;
  asUser: <T = Record<string, unknown>>(
    userId: string | null,
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>;
  passDeadline: (leagueId: string) => Promise<void>;
};

export async function createDb(): Promise<Db> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);

  const migrationsDir = path.resolve(__dirname, "../migrations");
  for (const file of readdirSync(migrationsDir).sort()) {
    await pg.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  return {
    pg,
    async createUser(name, { admin = false } = {}) {
      const { rows } = await pg.query<{ id: string }>(
        "insert into auth.users (raw_user_meta_data) values ($1) returning id",
        [JSON.stringify({ full_name: name, avatar_url: `https://example.test/${name}.png` })],
      );
      const id = rows[0].id;
      if (admin) await pg.query("update public.profiles set is_admin = true where id = $1", [id]);
      return id;
    },
    async asUser<T>(userId: string | null, sql: string, params: unknown[] = []) {
      const role = userId ? "authenticated" : "anon";
      const claims = userId ? JSON.stringify({ sub: userId }) : "";
      await pg.query("select set_config('request.jwt.claims', $1, false)", [claims]);
      await pg.exec(`set role ${role}`);
      try {
        const { rows } = await pg.query<T>(sql, params);
        return rows;
      } finally {
        await pg.exec("reset role");
      }
    },
    // The rules forbid moving a deadline into the past, so tests skip the triggers to time travel.
    async passDeadline(leagueId) {
      await pg.exec("set session_replication_role = replica");
      await pg.query("update public.leagues set deadline = now() - interval '1 hour' where id = $1", [
        leagueId,
      ]);
      await pg.exec("set session_replication_role = origin");
    },
  };
}
