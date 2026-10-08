# MMA Training Tracker

A phone-first training log for strength, conditioning and martial arts. It's an installable PWA that works offline and stores everything on your device (IndexedDB). There's no backend and no login.

**Features**
- **Workout logger.** Pick Upper A / Lower A / Upper B / Lower B; the next one in the rotation is highlighted. Weights are prefilled by the progression engine and last session's numbers sit beside each set. When the prefill is right, one tap on ✓ logs the set. Tap a set to adjust weight/reps with +/− steppers or add RPE. You can swap or skip exercises, add per-exercise notes, and see PRs on the finish screen.
- **Rest timer.** It starts automatically from the prescribed rest and runs on timestamps, so it survives a locked screen or a reload. It vibrates and beeps when rest is over, and can show a notification if you allow it.
- **Progression engine.**
  - Main lifts get +2.5 kg (upper) or +5 kg (lower) after a clean session, and −10% after two misses in a row.
  - Power lifts get an *optional* +2.5 kg.
  - Accessories move up by the smallest increment when you hit the top of the rep range.
  - Pull-ups are tracked toward 15+. Weighted pull-ups go up 2.5 kg after a clean 4×6.
  - A deload reminder appears every N weeks (one week at ~60% of the sets).
  - Epley e1RM and weight/rep/e1RM PRs are tracked.
- **Cardio & martial arts.** Log Zone 2 runs, bike/rower intervals, sprints (with optional times), 100 m tests, beep tests, and MMA/BJJ/striking/wrestling/sparring sessions.
- **Daily check-in.** Bodyweight, sleep (worked out from bed and wake times), macros, water, supplement and habit toggles, and quick-add buttons.
- **Dashboard.** Today's macro rings, this week vs targets, the goal matrix, adherence %, streaks and a training heatmap.
- **Charts.** Top set and e1RM, volume, bodyweight with a 7-day average, body fat, sleep and protein against their target bands, and weekly martial arts and Zone 2.
- **Fitbit sync.** Sleep, weight, body fat and runs come in through the Google Health API (see below).
- **Settings.** Edit templates, exercises (increment, starting weight, rule), targets, goals and the deload interval. Export/import a full JSON backup, export per-table CSV, and clear all data.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests: progression engine, e1RM, PRs, weekly targets, backup round-trip
npm run build        # production build to dist/
npm run test:e2e     # after build: phone-sized Chromium run incl. offline reload
```

`test:e2e` uses `playwright-core` and a local Chromium. Set `CHROMIUM_PATH` if yours is not at `/opt/pw-browsers/...`.

## Deploy (free)

### GitHub Pages
1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) tests, builds with the right base path, and publishes. Your app will be at `https://<user>.github.io/<repo>/`.

### Vercel
Import the repo at vercel.com. The framework preset is **Vite**, the build command is `npm run build` and the output is `dist`. No base path is needed.

## Install on your phone

The app has to be served over HTTPS (both options above are). Open it once while online so it can cache itself.

- **iPhone (Safari):** open the URL, tap **Share → Add to Home Screen → Add**. Launch it from the home-screen icon; it runs full screen and offline.
- **Android (Chrome):** open the URL, tap **⋮ → Install app** (or accept the install banner).

After that it works with no signal. Updates install automatically: the app checks for a new version whenever you switch back to it (and hourly while open) and reloads itself. Your data is unaffected. The build date is shown at the bottom of Settings → Data.

## Fitbit sync (Google Health API)

Settings → **Fitbit** pulls **sleep** (hours, bed and wake time into check-ins), **bodyweight and body fat**, and **runs** (as Zone 2 entries with duration, distance and average HR) from Fitbit through the Google Health API, which replaced the legacy Fitbit Web API (shut down 30 Oct 2026). Values you typed yourself are never overwritten. The first sync looks back 30 days.

It runs in the browser with no backend: Google sign-in returns a ~1 hour token. The app syncs when you tap **Sync**, or automatically on open while that token is still valid.

One-time setup in your own Google Cloud project:
1. Go to console.cloud.google.com and create a project.
2. **APIs & Services → Library**: enable **Google Health API**.
3. **Google Auth Platform** (OAuth consent screen): create it with **Audience: External**. Under **Audience → Test users**, add your Google account. Under **Data Access**, add the scopes `googlehealth.sleep.readonly`, `googlehealth.health_metrics_and_measurements.readonly` and `googlehealth.activity_and_fitness.readonly`.
4. **Clients → Create client → Web application**:
   - Authorized JavaScript origin: `https://<user>.github.io`
   - Authorized redirect URI: `https://<user>.github.io/<repo>/` (shown in the app under Settings → Fitbit)
5. Paste the client ID into Settings → Fitbit and tap **Connect Google & sync**. Google warns that the app is unverified; that's expected for a personal app. Tap *Continue*.

Your Fitbit has to be linked to the same Google account.

## Your data

- Everything lives in the browser's IndexedDB on that device. The app asks the browser for *persistent storage* so data isn't evicted.
- **Back up regularly:** Settings → Data → *Export full backup (JSON)*. Import restores everything, replacing current data. CSV export (sets, workouts, check-ins, cardio/MA) is there for spreadsheets.
- On iPhone, data in a home-screen app is separate from data in Safari tabs. Log from the installed app.

## Project layout

```
src/lib/        data model, Dexie DB + seed program, progression engine, PRs, weekly targets, goals, backup
src/pages/      Dashboard, Train (logger), CheckIn, Log (cardio/MA), Charts, Settings
src/components/ shared UI (steppers, rings, toggles) and the rest-timer bar
e2e/            offline/installability smoke test + icon generator
```
