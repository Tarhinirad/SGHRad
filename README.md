# SGUMC Radiology Resident Schedule

A web app for the radiology residency schedule at Saint George Hospital University Medical Center.
It stays in sync with an Excel workbook: you can import from `.xlsx`, edit on the site, and export back to `.xlsx` in the same format.

- **Frontend:** React, Vite, TypeScript, Tailwind CSS (`client/`)
- **Backend:** Node.js, Express, SQLite via better-sqlite3 (`server/`)
- **Rule engine:** pure TypeScript with unit tests, used by both the server and the browser (`shared/`)
- **Excel I/O:** ExcelJS

## Quick start

```bash
npm install
cp .env.example .env      # then set ADMIN_PASSWORD / VIEWER_PASSWORD
npm run dev               # API on :3001, web app on http://localhost:5173
```

The first time the server starts on an empty database, it seeds sample data (14 fictional residents, PGY-1 to PGY-4, for the current academic year).
To wipe the database and re-seed, run `npm run seed` or use **Settings → Reset to sample data**.

| Script | Purpose |
| --- | --- |
| `npm run dev` | API and Vite dev server with hot reload |
| `npm test` | Unit tests (rule engine, Excel import/export, API) |
| `npm run typecheck` | TypeScript check of all three packages |
| `npm run build` | Build the web app into `client/dist` |
| `npm start` | Production: one server on `PORT` that serves the API and the built app |
| `npm run seed` | Reset the database to the sample data |
| `npm run template` | Regenerate the Excel files in `templates/` |

## Access

- **Public guests** (no password) see Today, Week and Residents.
- **Resident view:** signing in with the resident password (`VIEWER_PASSWORD`) shows Today, Week, Year grid, Calls, Vacations and Residents, all read-only. Residents are listed PGY-4 first down to PGY-1.
- **Editing requires the admin password** (`ADMIN_PASSWORD`). Use **Admin sign in** at the top right. The admin types their name when signing in, and that name is recorded in the audit log. The audit log is visible to admins only.
- To require a password for viewing again, set `REQUIRE_LOGIN_TO_VIEW=true`. Everyone must then sign in; residents use `VIEWER_PASSWORD`.

Admin logins last 30 days per device. **Set a strong `ADMIN_PASSWORD` before deploying.**

## Excel workbook format

Import and export use exactly this structure. See `templates/SGUMC_Radiology_Schedule_Sample.xlsx` (sample data) and `templates/SGUMC_Radiology_Schedule_Template.xlsx` (empty).

| Sheet | Columns |
| --- | --- |
| Residents | ResidentID, Name, Phone, Year (PGY-1…PGY-4), Active (Y/N) |
| Monthly Schedule | ResidentID, Name, then one column per month of the academic year (`Jul 2026` … `Jun 2027`) |
| Vacations | ResidentID, Name, Start Date, End Date, Notes |
| Daily Calls | Date, On-Call ResidentID, On-Call Name (one row per calendar day) |

- The **ResidentID** links the sheets together. If a name doesn't match its ID, you get a warning and the ID is used.
- **One resident, several rotations:** join rotations with `+`, e.g. `Body+IR`. The resident is listed on both rotations every day and counts toward each one's capacity. If they are on vacation or post-call, the Vacation Cover or Post-Call resident takes over the whole combination. `+` can be combined with split months (`Body+IR/US` means Body and IR in the first half, US in the second). Vacation Cover and Post-Call cannot be combined with other rotations. In the year grid, click **+** next to a cell. For a single day, use **Adjust assignments → + rotation**.
- **Split months:** write two rotations separated by `/`, for example `Body/IR`. The resident does the first rotation from day 1 to day 15 and the second from day 16 to the end of the month (the split day can be changed in Settings). Give the other resident the opposite, `IR/Body`, so both rotations stay staffed. Each half is validated separately, and empty or over-capacity rotations are flagged day by day. In the year grid, click **½** next to a cell to split it.
- Monthly values must be rotation names (Body, Chest, MSK, Neuro, US, IR, Body MRI, Nuclear, Vacation Cover, Post-Call, Vascular, Elective, plus any added in Settings). Differences in capitalisation are corrected automatically. Unknown values are errors, unless you tick *"Add unknown rotation names as new external rotations"*.
- Dates can be real Excel dates, `YYYY-MM-DD` or `DD/MM/YYYY`. Month headers can be text (`Jul 2026`, `2026-07`) or Excel dates.
- **Import → Preview & validate** lists every error and warning, with sheet and row, before anything is saved. Files with errors cannot be imported.
  - **Merge:** updates residents by ID, overwrites non-empty monthly cells and call days, and adds vacations that are not exact duplicates.
  - **Replace:** deletes all residents, monthly assignments, vacations and calls, then loads the file. Per-day overrides made on the site are kept.
- The export adds drop-down validation lists for Year, Active and the monthly cells.

## Scheduling rules (`shared/src/engine.ts`)

For each date, the engine starts from each resident's monthly assignment and applies these steps in order:

1. **Vacation.** A resident whose vacation covers the date is *On Vacation* (start and end dates are inclusive).
2. **Vacation Cover.** The Vacation Cover resident takes over the rotation of the resident on vacation.
   - If nobody is on vacation, they go to **Mammography** (setting: *Vacation Cover default*).
   - If more residents on department rotations are on vacation than there are Vacation Cover residents, a **conflict warning** appears. By default the vacation that **started earliest** is covered; ties go to rotation order. On the day view, the admin can choose who is covered for that day.
   - Residents on vacation from external rotations, or from the Post-Call role, need no cover.
3. **Post-Call.** Yesterday's on-call resident is *Off – Post-Call* today, and the Post-Call resident takes over whatever that resident would have done today. That includes a rotation they were covering as Vacation Cover.
   - The following cases are **flagged** for the admin to resolve with *Adjust assignments* on the day view:
     - the caller was on an external rotation
     - the caller is the Post-Call resident themself
     - the Post-Call resident is on vacation, or none is assigned, so a rotation loses a resident
   - A caller who is on vacation today is only noted, since Vacation Cover already handles it.
   - If there is nobody to replace, the Post-Call resident goes to Mammography (setting).
   - Weekend and holiday calls: by default, the Sunday on-call resident is off on Monday (setting: *Post-call applies after weekend/holiday calls*).
4. **External rotations** (Vascular, Elective, and any added later) are left out of the department's daily and weekly display. By default these residents can still take calls (setting).
5. **Manual overrides.** Per-day assignments set by the admin take priority over the computed ones.
6. **Capacity.** Each internal rotation can have 0 to 3 residents (setting). There is a warning when a rotation is over the limit, or when it is empty on a working day. Mammography is not checked for being empty.

**Call shifts** start at 08:00 hospital time (setting: *Call shift starts at*). The Daily Calls entry for a date covers that day from 08:00 until 08:00 the next day. Before 08:00, the Today page shows the previous day's resident as **on call now**, with today's resident listed as next from 08:00.

Only **working days** are staffed: Monday to Friday by default, excluding listed holidays (both configurable).

### Validations (Warnings dashboard, and shown on each page)

- Rotation above capacity or empty
- Resident on call while on vacation (error)
- Same resident on call on consecutive days (a warning unless *Allow consecutive calls* is on)
- No Vacation Cover or no Post-Call resident assigned in a month
- More simultaneous vacations than cover capacity
- Post-call cases that need a decision (see above)
- Unknown or inactive residents, unknown rotation values, residents with no assignment
- Invalid or unknown values during Excel import (on the Import page)

### Decisions on the open "[Confirm]" items

These are defaults you can change in **Settings**, with no code changes needed:

| Question | Default |
| --- | --- |
| Admin and read-only access | One shared admin password for editing, one shared viewer password for residents |
| More than one resident on vacation | Cover the earliest-starting vacation; the admin can override per day |
| Post-call when the caller was external, on vacation, or is the Post-Call resident | Flagged; the admin resolves it with per-day overrides |
| Post-call after weekend/holiday calls | Yes |
| External residents eligible for calls | Yes |
| Consecutive-day calls | Not allowed (warning) |

## Pages

- **Today / Day:** each rotation with its residents and tap-to-call links; who is on call, who is post-call, who is on vacation and who covers whom. Admins get a cover-conflict chooser and *Adjust assignments*.
- **Week:** rotations × days; printable.
- **Year grid:** residents × months with drop-downs (admin), plus Vacation Cover and Post-Call checks per month; printable.
- **Calls:** month calendar; click a day to set who is on call (the picker marks residents on vacation, on call yesterday or tomorrow, or on an external rotation). Also shows call counts for fairness.
- **Vacations:** timeline calendar with overlap counts, and a list with add/edit/delete and overlap detection.
- **Residents:** directory by year; add, edit, deactivate.
- **Resident view:** one resident's year: monthly assignments, day-by-day schedule, calls, vacations and related warnings.
- **Warnings:** the dashboard, grouped by type.
- **Import / Export:** Excel download (current data or a blank template), and upload with preview.
- **Settings:** editable rotation list (add, rename with the change applied everywhere, reorder, change type, delete if unused), rule settings, holidays.
- **Audit log:** who changed what and when (admin only).

## Deployment

### Free public link (Render + Neon)

This setup costs nothing. The app runs on Render's free plan, and the data is kept in a free Neon Postgres database.
The app works on an in-memory SQLite database. It loads the latest copy from Postgres at startup and saves a new copy a second or two after every change, so edits survive restarts and redeploys.

1. **Create the free database.** Sign up at [neon.tech](https://neon.tech) (no card needed) and create a project.
   Copy the **connection string**, which looks like `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
2. **Create the web service.** In Render, go to **New → Web Service**, connect the `Tarhinirad/SGHRad` repo, and fill in:
   - Branch: the branch holding this code
   - Runtime: **Node**
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Instance type: **Free**
   - Environment variables: `ADMIN_PASSWORD`, `VIEWER_PASSWORD`, `NODE_VERSION` = `22`, `DATABASE_URL` = the Neon connection string
   
   You can also use the [Deploy to Render button](https://render.com/deploy?repo=https://github.com/tarhinirad/sghrad), which reads `render.yaml` and asks for the same values.
3. After about 3–5 minutes the link appears at the top of the Render page (for example `https://sgumc-radiology-schedule.onrender.com`).

Free-plan limits:
- The service sleeps after 15 minutes without visitors, and the next visit takes about 30–60 seconds to wake it. To avoid this, set up a free uptime monitor (for example UptimeRobot) that requests `https://<your-app>.onrender.com/api/health` every 10 minutes. One always-on service fits within Render's 750 free hours per month.
- Edits made in the last second or two before a crash could be lost. Normal restarts and redeploys save first.
- Download an Excel export from time to time as a backup.

Paid alternative: Render *Starter* with a persistent disk. Mount it at `/var/data`, set `DB_FILE=/var/data/sghrad.db`, and leave `DATABASE_URL` unset.

### Docker (Railway, Fly.io, any VPS)

```bash
docker build -t sgumc-schedule .
docker run -d -p 80:3001 -v sgumc-data:/data \
  -e ADMIN_PASSWORD=... -e VIEWER_PASSWORD=... sgumc-schedule
```

### Plain Node.js server

On any server with Node.js 20 or later:

```bash
git clone <repo> && cd SGHRad
npm ci
cp .env.example .env    # set strong passwords, SESSION_SECRET, PORT
npm run build
npm start               # serves the app and API on $PORT
```

- Run it under a process manager (for example `pm2 start "npm start" --name sgumc-schedule`, or a systemd unit), behind a reverse proxy with HTTPS (nginx or Caddy).
- **Back up** the SQLite file (`data/sghrad.db`, or `DB_FILE`). Copying it while the server is stopped is enough, or use `sqlite3 data/sghrad.db ".backup backup.db"`. Exporting to Excel regularly also gives you a readable backup.
- `SEED_ON_EMPTY=false` starts the production database empty. Then import your workbook from the Import page.

## Project layout

```
shared/src/     dates.ts, types.ts, engine.ts (rule engine)
shared/test/    rule-engine unit tests
server/src/     app.ts (API), db.ts (SQLite), excel.ts, importer.ts, auth.ts, seed.ts
server/test/    Excel round-trip/validation and API tests
client/src/     React app (pages/, components/)
templates/      sample + blank Excel workbooks
```
