# Opus Ball — Manager Career

A mobile-first football manager career in the style of EA SPORTS FC Career Mode, built as an offline-capable web app (PWA). Matches are played as a live minute-by-minute simulation: one real second is one match minute at 1×, with 2×/4×, pause, next event, skip to half-time and sim to end, while you make substitutions and change mentality, tactics and formation live.

## Real data

- **Players:** EA SPORTS FC 27 database (SoFIFA roster 27.0002). This covers ratings, the full attribute set, PlayStyles and PlayStyles+, positions, contracts, values, work rates, skill moves and weak foot.
- **Leagues:** real 2026/27 league memberships across 34 leagues, and real 2026/27 fixture lists for the major leagues.
- **Competitions:** real league rules (promotion, relegation, play-offs, UEFA places), real domestic cup formats, and the UEFA Champions League, Europa League and Conference League Swiss-model league phase and knockouts drawn from the real 2026/27 pots. Super Cups use the real 2025/26 honours.
- **Clubs:** real crests, stadiums, capacities, colours, rivalries and current managers.
- **Images:** player headshots load from the SoFIFA image CDN on device and are cached for offline play. Players without a headshot show a kit-coloured silhouette.

## Features

- **New career:** manager creation with an avatar editor, nationality and age, then league and club selection with an inspect screen, career settings and confirmation.
- **Hub:** a dynamic hub with the next match, a calendar strip, board mood, inbox, table and squad status. Continue has stop conditions, and you can advance to a chosen date.
- **Squad:** squad hub, a rich player profile (face stats, attributes, radar, PlayStyles, role familiarity, stats, career, promises) and a team-sheet editor. The team sheet covers formations, roles and focus, tactics, set pieces and multiple sheets.
- **Transfers:**
  - Transfer Hub, search with filters, shortlist, and the Global Transfer Network scouting.
  - Live negotiation room covering fee, sell-on clause, player exchange, loans and loans with an option or obligation to buy, followed by personal terms.
  - Delegation to your Sporting Director.
  - Incoming bids and counter-offers, pre-contracts, deadline day and loan recalls.
- **Player care and development:**
  - Youth academy with youth scouts, missions and prospects.
  - Training and development plans, and position changes.
  - Fitness, injuries and suspensions.
  - Morale, player conversations and promises, and pre- and post-match press conferences.
- **Club and career:**
  - Inbox with actionable messages, and a news feed.
  - Board objectives and confidence, finances and ledger.
  - Manager career, sacking and job offers.
  - Monthly and season awards, and past seasons.
- **World simulation:**
  - AI transfers and AI manager sackings and appointments.
  - Dynamic values, player growth and decline, retirements and regens.
  - Season rollover with promotion, relegation and play-offs, and a multi-season world.
- **Saves:** autosave, manual saves, multiple slots, load and delete. Saves are gzip-compressed in IndexedDB.

## Run

```bash
npm install
npm run dev        # development server
npm run build      # production build (PWA) in dist/
npm run preview    # serve the production build
```

Deploy to GitHub Pages with the **Deploy to GitHub Pages** workflow. Run it manually, or push to `main` after enabling Pages with the source set to "GitHub Actions". On a phone, open the site and choose **Add to Home Screen** to install it; after the first load it works fully offline.

## Data pipeline

`npm run data:build` rebuilds `public/data/world.json`, the crests and the competition logos from the sources in `scripts/data/`.

## QA

- `npx tsx scripts/qa/season.ts "<club>" <seasons>` runs a headless multi-season career.
- `scripts/qa/calibrate.ts` checks match-engine realism.
- `scripts/qa/e2e*.mjs` are Playwright end-to-end runs against `npm run preview`: career creation and match flow, transfers, calendar, conversations and saves, and a full season.

Opus Ball is an unofficial fan project and is not affiliated with EA SPORTS, UEFA or any league or club.
