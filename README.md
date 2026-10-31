# TT Courtside

Table tennis match and error tracker for the iPhone home screen. Works offline.

**Version 0.2:** live tracker, reflection and Save to Jira (TT1).

## What it does

- Live scoring with two-thumb buttons: winner or unforced error per player
- ITTF serve rotation (2 serves each, 1 each from 10:10), deuce, set and match point
- Best of 3, 5 or 7; prompt to change ends at 5 points in the deciding set
- Undo, including back into the previous set
- Stats per match or set: points, winners, errors, serve points won, point-by-point log
- History of saved matches on the device; export CSV, JSON or a text report via the share sheet
- Keeps the screen on during play (where the browser supports it)
- **My details** (name, club) fill in player 1 for every new match; opponent club and TTR in match setup
- **Reflection** after the match: the eight TT1 questions, concentration %, flow score, notes
- **Save to Jira:** creates one TT1 issue per match (title `Club: Opponent (TTR)`, Spieltag, answers, result label, stats in the description). Saving again asks before updating the existing issue; it also checks for an issue for the same opponent and date
- Jira link is configurable in Settings (site, project, issue type, labels, field IDs, test connection). The API token is stored only on the phone

## Jira setup

Jira blocks direct calls from web apps, so the app talks to Jira through a tiny relay you run for free on Cloudflare.
See [relay/README.md](relay/README.md).

## Install on the iPhone

1. Open the GitHub Pages address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it once while online; after that it works in airplane mode.

Installed to the home screen, iOS keeps the app's data; in a normal Safari tab it may be cleared after 7 days without use.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # scoring engine tests
npm run build     # production build into dist/
```

Stack: Vite, TypeScript, Preact, Tailwind CSS, vite-plugin-pwa (Workbox), idb-keyval (IndexedDB).
Scoring rules live in `src/engine.ts` with tests in `src/engine.test.ts`.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`: tests, type check, build, publish to GitHub Pages.
One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Notes

- `npm audit` reports moderate issues in build-time dependencies of vite-plugin-pwa; the shipped app has none (`npm audit --omit=dev`).
- Matches saved by the old single-file tracker live in that page's browser storage and are not carried over.
