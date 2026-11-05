# Final Table: Product Spec

**Status:** Draft for review
**Date:** 2 November 2026
**Summary:** A mobile-first web app where players rank a league's teams before its deadline, then follow a live leaderboard as the season plays out.

## 1. Goals

- Joining and submitting a prediction from a shared link should be fast and enjoyable on a phone.
- Any league should work, in any sport or at any level, without relying on an external data feed.
- Everything should run on free tiers for a non-commercial project with up to a few thousand users.

### Out of scope for v1

- Ads, payments, paid entry and prizes
- Playoff winner or bracket predictions
- Automatic results from a sports API
- Email or Apple login
- Email reminders (see section 13)
- Web push notifications
- Creator-customised scoring
- Chat, comments and native mobile apps

## 2. Users, competitions and league types

### How the game is structured

```text
Sport: Football
  Competition: Premier League
    Season: 2026-27
      teams, deadline, zones, standings
      one prediction per player
      leagues:
        Premier League 2026-27 (official, no owner)
        Dave's Mates (private, Dave)
        Pub League (public, Sam)
```

A **season** is the thing being predicted. A **league** is a group of people playing a season, with a name, a privacy setting and members. A custom league gets its own hidden season, which users never see, so every league works the same way.

**On screen,** official leagues are called **global leagues**, because "official" beside a real league's name would read as if that league endorses them. Someone running their own competition, with their own teams and table, has a **league**. Friends playing a real league together have a **group**. Database names and `/leagues/` URLs keep the word "league".

| Type | Created by | Listed on Explore | How to join |
|---|---|---|---|
| Official | Any admin. Belongs to the site, with no owner | Yes, Global leagues tab | Anyone signed in |
| Public | Any logged-in user | Yes, Run by players tab | Anyone |
| Private | Any logged-in user | No | Code or link |

Public and private leagues can be **custom**, with their own teams and table, or use a **preset**, which plays an official season.

| Role | Can do |
|---|---|
| Player | Submit and edit a prediction before the deadline, and view the leaderboard |
| Spectator | View the table, leaderboard and revealed picks, without entering or scoring |
| Creator | Everything a player can do, plus manage their league |
| Admin | Create and manage official leagues, review reports, and hide or remove any league |

### Official leagues and presets

- Each season of a competition has one official league. It has no owner, so it only appears under Your Leagues for people who join it, including the admin who created it.
- Every published official season is automatically available as a preset until its deadline. After that it disappears from the preset list.
- A new season can copy teams, logos and zones from the previous one, ready for the admin to swap promoted and relegated teams.
- A preset league's creator chooses only its name and privacy. Teams, zones, deadline and standings come from the official season, so an admin's update reaches every league on that season immediately.

### Conferences

Some leagues split their teams into conferences, such as MLS and the NBA. People pick the league once and rank each conference as its own table.

- **One prediction, one leaderboard:** a prediction is still one list of every team, and a conference's table is that list filtered to its teams. A season with no conferences works exactly as it did.
- **Scoring:** each conference is scored as its own table using the season's zones, and the points are added up. That means a first-place bonus in each, and zones such as "top 8" apply in each.
- **Ranking:** a team can't be moved across conferences. Submitting with a conference still in alphabetical order gets a warning that names it.
- **The crowd's pick** is given for each conference, under the same rules as a single table.
- **Setting up:** conferences are added with SQL for now, and a copied season keeps them. The wizard can rename a team in a split league but not add one. Custom leagues can't have conferences yet.

### Guest players

An admin can add someone's table for them, using the SQL Editor only. A guest is a profile with no login, shown under a short name such as "Alex P.". They rank and score like anyone else, but nobody can sign in as them. This is how the friends' Premier League 2026-27 tables were backfilled, and it's the one exception to predictions being written before the deadline. The app has no path for it, so that rule still holds for everything the app does. Guest data goes in `supabase/private/`, which is git-ignored.

### Browsing without an account

The home and Explore pages, and the pages of global leagues and public leagues and groups, need no account. Joining and seeing other people's picks still need sign-in.

- **Cards** show the lock date and time left, and the current leader once a league is live.
- **Player counts and the crowd's pick** appear from 10 players, so a small league can't give away who picked what. The crowd's pick covers everyone with a table for that season, including private groups, and is rounded to the nearest 5%.
- **Public leagues and groups** reach the home page from 3 players, so a brand-new one can't put its name on the front page. Explore lists them all.
- **Running your own league** has its own section on the home page, leading straight into the setup wizard. Its example uses made-up teams and players, and says so.
- **Search engines** see global leagues only. Players' own leagues, groups and join pages are marked noindex.

### One prediction per season

- A player has one table per season, and it counts in every league they're in for that season. Editing it before the deadline changes it everywhere.
- Each new season needs a new prediction.
- Ranks are per league, so the same score can be 1st among friends and 900th in the official league.
- Someone joining another league on the season after the deadline keeps their locked table, which counts straight away. Anyone with no table for that season becomes a spectator.
- After the deadline, a player's table is visible only to people who can see a league they play in, so playing only in a private league keeps it private.

## 3. Core flows

### 3.1 Create a league

Creating a league starts with a choice:

- **Use a preset:** choose sport, then competition, then season (skipped when only one is open), then a name and privacy. The league is ready straight away.
- **Custom league:** the setup wizard below, which saves as a draft.
- **Official league (admins only):** sport, competition, season label and deadline, optionally copying the previous season, then the wizard below.

Custom league steps:

1. **Basics:** league name, public or private, optional sport label, number of teams (4 to 40), and start date and time.
2. **Teams:** a name for each team, plus an uploaded logo or an auto-generated badge made from the team's initials and chosen colours. Pasting a list of names, one per line, fills the list quickly.
3. **Format:** optional promotion, playoff and relegation zones, shown on a live preview of the table.
4. **Review and publish:** the creator gets a share link and code.

Rules after publishing:

- Team names and logos can be edited until the deadline.
- Adding or removing a team resets existing predictions to "needs review". Affected players are told when they next open the league, and the team set is locked at the deadline.
- The deadline can be moved until it passes. It can't be reopened afterwards, because picks have been revealed by then.
- A creator can delete a league until the deadline. After that, only an admin can remove it.

### 3.2 Join

1. A player opens `/join/CODE` or a league link and sees a preview: name, creator, team count and time left.
2. They tap **Continue with Google**, then return to the same league automatically.
3. They land directly on the prediction screen.

**In-app browsers:** Google blocks sign-in inside embedded webviews, which some apps use to open links (Instagram and TikTok are reported cases). The app detects these browsers before showing the sign-in button and shows a clear **Open in your browser** step with a copy-link fallback.

### 3.3 Make a prediction

This is the most important screen in the app.

**Layout**

- A single-column list of teams, in alphabetical order to start.
- Each row shows position, badge, team name and a drag handle, and is at least 56px tall.
- Zones are coloured bands and lines tied to positions, so they stay put while teams move through them.
- The header stays visible with the league name and a countdown. The Submit button stays fixed within thumb reach.

**Interactions**

- **Drag:** hold the handle and the row lifts straight away, with no long press. The list auto-scrolls near the screen edges.
- **Scroll:** swiping anywhere other than the handle scrolls the page, so scrolling and dragging don't conflict.
- **Tap to place:** tap a team to select it, then tap a position. The team moves there and the others shift, exactly as with a drag. Tapping the team again cancels.
- **Keyboard and screen reader:** full reordering with announcements of each move.
- **Undo and reset:** undo the last move, or reset to alphabetical order.
- **Feel:** smooth reordering animations and a short vibration where supported (iOS Safari doesn't support it). All motion respects the reduced-motion setting.

**Saving**

- The order is kept on the device as a draft after every move, so an accidental refresh loses nothing.
- If the list is still in alphabetical order, Submit asks for confirmation.
- After submitting, the player sees a short success moment, their predicted table, the deadline and a share link.
- Players can return and resubmit any time before the deadline. If time runs out mid-edit, the last submitted version stands and the screen says so.

### 3.4 After the deadline

- Predictions lock, and every player's picks become visible to the league.
- Anyone arriving later can join as a spectator. Private leagues still require the code or link.
- The league page has three tabs: **Leaderboard**, **Table** (with the player's prediction alongside it) and **Picks** (any member's predicted table, which needs sign-in).
- Before the first standings update, the leaderboard lists who is locked in, with no points. Big leagues are paged, 50 players at a time.

### 3.5 Update standings

- A custom league's creator, or an admin for official seasons, reorders the table using the same component as the prediction screen and saves it. Preset leagues update automatically from the official season.
- Saving recalculates all scores in a single transaction.
- Each update is recorded with its time and author, and members can see when the table last changed. This matters because creators can also play in their own leagues.
- The creator marks the league **Finished** after the final update, which makes the scores final. Admins can reverse this if it was a mistake.

## 4. Scoring

For a league of `N` teams, each team earns:

```text
points = N - |predicted position - actual position|
```

A perfect pick earns `N` points. In a 20-team league, a team predicted 3rd scores 20 if it's 3rd, 18 if it's 5th and 3 if it's 20th.

This is the version to test in the first release. A different points system may be tried afterwards, so scoring lives in one database function that can be changed without touching the rest of the app.

Bonuses are added on top:

| Correct pick | Bonus |
|---|---|
| Champion (exact) | +10 |
| Each promoted team | +5 |
| Each relegated team | +5 |
| Each playoff team | +3 |

- A zone bonus applies when a team is predicted in a zone and is currently in that zone, whatever its exact position.
- Zone bonuses only apply to zones the league has enabled.
- Bonuses are calculated against the current table and labelled **provisional** until the league is finished.
- Players are ranked by total points, then by number of exact positions. Anyone still level shares the rank.
- The leaderboard shows each player's rank movement since the previous update. It's empty until the first standings update.
- Only players who submitted before the deadline appear on the leaderboard.

## 5. League lifecycle

| State | Starts when | What's allowed |
|---|---|---|
| Draft | Creation | Only the creator can see and edit it |
| Open | Publish | Players join and submit, and picks stay hidden |
| Live | Deadline passes | Predictions lock, picks are revealed and standings can be updated |
| Finished | Creator marks it finished | Read-only, with final scores |
| Hidden | Admin action | Removed from the directory and links, pending review |

The change from Open to Live isn't a scheduled job. It's worked out by comparing the deadline with the database clock whenever data is read or written, so it takes effect exactly on time. See section 7.

## 6. Moderation

- Any logged-in user can report a league they can see, or one of its team logos. Each person can have one open report per league or team, and send 20 a day.
- Admins review reports in a queue grouped by league. They can dismiss one report or all of a league's reports, hide the league (which closes its reports), or remove a reported logo, which also deletes the file because logos are served publicly.
- Admins can also hide, unhide or delete any league from its page. A hidden league stays visible only to its creator and admins, and the creator is told it's under review.
- League creation is limited to 5 per user per day.
- Terms of use make uploaders responsible for the images they upload. Club logos may be trademarked, so official leagues should use auto-generated badges unless you have permission.

## 7. Technical design

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (App Router), TypeScript, Tailwind CSS | Installable as a basic web app |
| Hosting | Vercel Hobby | Permitted because the project is non-commercial |
| Database | Supabase Postgres | Row-level security enforces the rules |
| Login | Supabase Auth with Google | |
| Images | Supabase Storage | Logos are resized in the browser |
| Public pages | Built ahead by Next.js and refreshed at most every 15 minutes | Visitors don't reach the database. Only a change to what's listed clears the pages early, so joining or predicting doesn't |
| Scheduled jobs | Vercel Cron | Daily database keep-alive |
| Backups | GitHub Actions | Nightly encrypted database dump |
| Ranking | `@dnd-kit/react`, pinned to an exact version | See below |

### Drag-and-drop choice

| Library | Assessment |
|---|---|
| `@dnd-kit/react` | **First choice.** Has a sortable preset, touch handling, configurable auto-scroll, keyboard support and reduced-motion support. It's actively maintained but still pre-1.0 (v0.5.0, June 2026), hence the pinned version. |
| Motion `Reorder` | **Fallback.** Offers drag handles, auto-scroll and keyboard reordering with very little code. Its docs don't address touch, so it needs device testing. |
| Pragmatic drag and drop | Rejected. It's a low-level toolkit, so we'd write more of the list behaviour ourselves. |
| `react-beautiful-dnd` | Rejected. Atlassian no longer recommends it for new projects. |

The ranking component is built behind a simple `order` and `onChange` interface, so the library can be replaced. Tap-to-place needs no library, so players still have a working option if dragging misbehaves on a device.

Sources disagree on the right `touch-action` setting. The plan is `touch-action: none` on the handle only, confirmed by the device tests in milestone 1.

### Data model

```text
profiles            id, display_name, avatar_url, is_admin, is_guest
sports              id, name
competitions        id, sport_id, name, accent, sort_order, opens_note
seasons             id, competition_id, label, sport_label, team_count, deadline,
                    promotion_count, playoff_from, playoff_to, relegation_count,
                    promotion_label, playoff_label, relegation_label,
                    status (draft | published | finished), finished_at
leagues             id, slug, join_code, type, name, season_id, created_by, hidden_at
teams               id, season_id, name, short_name, logo_path, colour_primary, colour_secondary
memberships         league_id, user_id, role (player | spectator), joined_at
predictions         id, season_id, user_id, team_order (uuid[]), needs_review, submitted_at
standings_updates   id, season_id, version, team_order (uuid[]), updated_by, created_at
prediction_scores   prediction_id, standings_update_id, base_points, bonus_points, exact_count
reports             id, league_id, team_id, reported_by, reason, status, created_at
```

The `league_details` view joins a league to its season, competition and sport for reading. All writes go through database functions. Only the latest and previous sets of scores are kept for each season, to keep the database small. Ranks are worked out per league when read, by `league_leaderboard`. "Live" and "Hidden" in section 5 aren't stored as statuses: Live is a published season past its deadline, and Hidden is a league with `hidden_at` set, so unhiding restores its previous state.

### Rules enforced in the database

Browser checks are only for convenience. Row-level security and database functions enforce these rules:

- Predictions can only be written before the deadline, using the database clock.
- Other players' predictions can't be read until the deadline has passed.
- A prediction must contain each of the league's teams exactly once.
- Private leagues can only be read by members, or through the join-code lookup.
- Only the creator or an admin can update standings.
- Scores can only be written by the scoring function.

Each of these rules gets an automated test.

### Image handling

- Logos are resized to 256px WebP in the browser, then uploaded.
- Storage accepts raster images up to 200 KB and rejects SVG, which can contain scripts.
- Images are served directly from Supabase rather than through Vercel's image optimisation, which has a limit of 5,000 transformations a month on the free plan.

## 8. Free-tier limits

| Service | Free limit | What it means here | Mitigation |
|---|---|---|---|
| Vercel | Non-commercial use only | Adding ads or payments later requires a paid plan or a move | Avoid Vercel-specific features where practical |
| Vercel | 4 active CPU hours, 1M function calls and 100 GB transfer | Going over can pause a feature for up to 30 days | Cache pages, do scoring in Postgres, and set usage alerts |
| Vercel | Cron runs daily, with up to 59 minutes of drift | Rules out precise schedules | Deadlines don't rely on cron |
| Supabase | Pauses after 1 week of inactivity | Could take the site down in the off-season | Daily job touches the database. Confirm this counts as activity |
| Supabase | No automatic backups | Data loss risk | Nightly encrypted dump through GitHub Actions |
| Supabase | 500 MB database, 1 GB storage, 5 GB transfer plus 5 GB cached, 50,000 monthly users | Comfortable for the expected scale | Small logos and long cache lifetimes |

Limits were checked on 2 November 2026 and can change.

## 9. Quality targets

- **Ranking test:** a first-time user can reorder a 20-team list and submit on a phone without instructions.
- **Devices:** tested on real hardware with iPhone Safari and Android Chrome, plus in-app browsers from WhatsApp, Instagram and Messenger.
- **Performance:** the prediction screen is usable within 2.5 seconds on a mid-range phone on 4G. Dragging 40 teams stays smooth.
- **Accessibility:** WCAG 2.2 AA, including full ranking without dragging.
- **Time zones:** deadlines are stored in UTC, shown in the viewer's local time, and shown with the time zone during setup.
- **Privacy:** a privacy policy and terms, an editable display name, and self-service account deletion. Email addresses are never shown to other users. Deleting an account removes that person's profile, memberships and predictions, and any league nobody else is in. A league with other members passes to its longest-standing member.

## 10. Milestones

1. **Ranking prototype:** build the ranking screen with fake data and test it on real phones. This is the highest product risk, so it comes first, and it settles the library choice.
2. **Foundations:** Next.js and Supabase setup, Google login, the schema, security rules and their tests.
3. **Creating and joining:** the setup wizard, logos and badges, codes and links, and in-app browser handling.
4. **Predictions:** connect the ranking screen to real data, including drafts, submit, edit and deadline lock.
5. **Live season (done):** standings updates, scoring, leaderboard, pick reveal and spectators.
6. **Discovery and admin (done):** Explore, official leagues and presets, reports and the admin queue.
7. **Launch readiness:** backups, usage alerts, legal pages and a final device pass.

## 11. Decisions

### Confirmed

- **Login:** Google only for the first release, accepting that anyone without a Google account can't play.
- **Points:** test the system in section 4 first, and consider alternatives later.
- **Reminders:** no email in the first release, so there are no deadline reminders.
- **App name:** Final Table.

### Still open

- **URL:** a free `*.vercel.app` address works to begin with.

### Assumptions to correct if wrong

- "League type" in your brief means official, public or private. Sport is required for official leagues, and an optional label on custom ones.
- "League start date" includes a time, because a deadline needs an exact moment.
- The deadline is the league's start, with no separate setting.
- Team count ranges from 4 to 40.

## 12. Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Resend pricing](https://resend.com/pricing)
- [dnd-kit changelog](https://dndkit.com/changelog)
- [dnd-kit pointer sensor](https://dndkit.com/extend/sensors/pointer-sensor)
- [dnd-kit legacy pointer sensor](https://dndkit.com/legacy/api-documentation/sensors/pointer)
- [dnd-kit touch sensor](https://docs.dndkit.com/api-documentation/sensors/touch)
- [Motion Reorder](https://motion.dev/docs/react-reorder)
- [Comparison of dnd-kit, react-beautiful-dnd and Pragmatic drag and drop](https://www.pkgpulse.com/guides/dnd-kit-vs-react-beautiful-dnd-vs-pragmatic-drag-drop-2026)
- [Google's OAuth policy on embedded webviews (2021)](https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/)
- [Report of Google login failing in Instagram and TikTok browsers](https://community.auth0.com/t/google-social-error-for-web-login-from-embedded-browsers/110494)
- [Brevo free plan details (third-party review)](https://costbench.com/software/marketing-automation/brevo/free-plan)
- [Report of Brevo emails failing without a verified domain](https://dev.to/tigawanna/brevo-smtp-emails-to-other-gmail-accounts-silently-failing-verified-domain-to-the-rescue-1d78)

## 13. Deferred: email reminders

Notes for a later release:

- **Timing:** a daily job would email players who joined but haven't submitted, when the deadline is 12 to 36 hours away. Vercel's free cron runs once a day and can fire up to 59 minutes late, so an exact "24 hours before" isn't possible.
- **Safeguards:** record each reminder sent to prevent duplicates, include a one-click unsubscribe, and apply a daily sending cap with the soonest deadlines first.
- **Provider options:** every free option has a catch.
  - Dedicated Gmail account over SMTP: free and needs no domain, but it looks less professional, its daily limit needs confirming, and automated sending could get the account flagged.
  - Resend: 3,000 emails a month and 100 a day, but it probably needs a verified domain, at roughly US$10-15 a year. This hasn't been confirmed against its docs.
  - Brevo: reportedly 300 a day, but one developer reported messages silently failing to reach Gmail without a verified domain.
