# CincyBusTrackr

A real-time Cincinnati Metro bus tracker. View all 50 routes and both directions at once — something Metro's own (now-defunct) tool never supported.

Inspired by [TrainTrackr.io](https://traintrackr.io). Data sourced from SORTA's public GTFS-RT feed.

> This project is not affiliated with or endorsed by SORTA or Cincinnati Metro.

---

## Table of Contents

1. [What this project is](#what-this-project-is)
2. [How the pieces fit together](#how-the-pieces-fit-together)
3. [Running it on your own computer](#running-it-on-your-own-computer)
4. [Common things you might want to change](#common-things-you-might-want-to-change-no-coding-experience-needed)
5. [Making a change and seeing it live](#making-a-change-and-seeing-it-live)
6. [Deployment (putting it on the real internet)](#deployment-putting-it-on-the-real-internet)
7. [Keeping the data up to date](#keeping-the-data-up-to-date)
8. [Project structure reference](#project-structure-reference)
9. [Glossary](#glossary)
10. [Getting help / troubleshooting](#getting-help--troubleshooting)

---

## What this project is

CincyBusTrackr shows every SORTA/Metro bus in Cincinnati on a live map, updating every 30 seconds. You can:

- See all 50 routes and both directions at the same time (filter by category if it gets busy)
- Click a bus to see its next stop and ETA
- Switch to dark mode
- Share a link that opens the map already filtered to specific routes (e.g. `?routes=4,43&dir=inbound`)
- See service alerts (delays, detours, etc.) in a banner at the top

It has two halves:

- A **backend** (the "engine room") written in Python, which fetches bus data from Metro every 30 seconds and serves it up in a simple format.
- A **frontend** (the part you see in your browser) written in React/TypeScript, which draws the map and the buses on it.

You don't need to understand Python or React to make most common changes — see [Common things you might want to change](#common-things-you-might-want-to-change-no-coding-experience-needed) below.

## How the pieces fit together

```
Your browser  <--->  Frontend (React app, what you see)  <--->  Backend (Python server)  <--->  Metro's live data feed
```

- The **backend** polls Metro's official data feed every 30 seconds, so no matter how many people are using the site, Metro's servers only get hit once every 30 seconds — not once per visitor.
- The **frontend** asks the backend "what buses are out there right now?" and draws them on the map, smoothly animating them between updates.
- Route shapes (the lines on the map) and bus stops are pre-generated files (`static/routes.geojson` and `static/stops.geojson`) that rarely change.

## Running it on your own computer

This is only needed if you want to preview changes before they go live, or if you're not deploying anywhere and just want to run it locally.

### Prerequisites (one-time setup)

You need two free tools installed:

1. **Python 3.11 or newer** — [download here](https://www.python.org/downloads/). During install on Windows, check the box "Add Python to PATH".
2. **Node.js 20 or newer** — [download here](https://nodejs.org/) (choose the "LTS" version).

To check if you already have them, open a terminal (Terminal on Mac, Command Prompt/PowerShell on Windows) and type:

```bash
python3 --version
node --version
```

If both print a version number, you're set.

### Getting the code

```bash
git clone git@github.com:MitchellFerguson1/CincyBusTracker.git
cd CincyBusTracker
```

(If you already have the folder — e.g. you're reading this file inside it — you can skip this step and just open a terminal inside the project folder.)

### Starting everything with one command

From the project's root folder, run:

```bash
./dev.sh
```

This starts both the backend and frontend together, and waits for the backend to be healthy before starting the frontend. When it's ready, you'll see:

```
Backend:  http://localhost:8000/api/health
Frontend: http://localhost:5173
```

Open **http://localhost:5173** in your browser — that's the live map. Press `Ctrl+C` in the terminal to stop both servers.

### Starting things manually (if `./dev.sh` doesn't work)

Open **two** terminal windows/tabs.

**Terminal 1 — backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
npm run dev
```

Then open **http://localhost:5173**.

## Common things you might want to change (no coding experience needed)

Below are the most likely edits, with the exact file and what to look for. All of these are plain text files — you can open them in any text editor (Notepad, VS Code, TextEdit, etc.) and edit them like a Word document, then save.

### Change which category a route belongs to

**File:** [`config/route_categories.json`](config/route_categories.json)

This file is a simple list: route number → category. Categories are `Core`, `Major`, `Minor`, `Commuter`, or `Express` — they control how routes are grouped in the route selector menu.

```json
"4": "Core",
"43": "Core",
```

To move route 43 into "Major" instead, just change the word on the right, keeping the quotes:

```json
"43": "Major",
```

Save the file, refresh your browser (if `dev.sh` is running) — no restart needed.

### Change the disclaimer text at the bottom of the screen

**File:** [`frontend/src/components/StatusBar.tsx`](frontend/src/components/StatusBar.tsx), around line 55

```tsx
<span className={styles.disclaimer}>
  Not affiliated with SORTA&nbsp;/&nbsp;Cincinnati Metro
</span>
```

Edit the text between the `<span>` tags. `&nbsp;` just means "a space that won't break onto a new line" — leave those as-is unless you know what you're changing.

### Change the browser tab title

**File:** [`frontend/index.html`](frontend/index.html), line 7

```html
<title>CincyBusTrackr — Cincinnati Metro Live Map</title>
```

Change the text between `<title>` and `</title>`.

### Change the map's starting location or zoom level

**File:** [`frontend/src/components/Map.tsx`](frontend/src/components/Map.tsx), lines 7–8

```ts
const CENTER: [number, number] = [-84.512, 39.1];  // [longitude, latitude]
const ZOOM = 11;                                    // higher number = more zoomed in
```

This is the point the map opens on before the user pans around. Note the order is **longitude, then latitude** (backwards from how map coordinates are usually written).

### Change how often the map refreshes

**File:** [`frontend/src/constants.ts`](frontend/src/constants.ts)

```ts
export const POLL_MS = 30_000;  // 30,000 milliseconds = 30 seconds
```

⚠️ Don't set this lower than 30 seconds — Metro's live feed itself only updates every 30 seconds, so refreshing more often just wastes bandwidth without showing newer data. If Metro ever changes their update frequency, this is where you'd match it.

### Change the map's colors / style (light and dark mode tiles)

**File:** [`frontend/src/components/Map.tsx`](frontend/src/components/Map.tsx), around lines 18–21 — this is the underlying map imagery (roads, buildings, labels), separate from the bus route lines.

```ts
dark
  ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
  : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
```

These are "tile providers" — free map imagery services. Swapping either URL changes the look of the base map. (See [Deployment](#deployment-putting-it-on-the-real-internet) below — before going live to the public, the light-mode URL should be swapped from the free OpenStreetMap tile for a CDN-backed provider like MapTiler or Stadia Maps, which handle real traffic more reliably.)

### Change route colors

Route colors come directly from Metro's official data (each route already has an assigned color), so you normally don't need to touch anything. If two routes look too similar in color, you can hardcode an override in the same `Map.tsx` file — ask a developer/Claude Code for help with this one, since it involves a small code change rather than just editing a value.

## Making a change and seeing it live

1. Make sure `./dev.sh` (or the two manual terminals) is running.
2. Edit and save any file listed above.
3. Switch to your browser tab at `http://localhost:5173` and refresh. Most changes (like the JSON file or text changes) appear instantly or after a refresh — you don't need to restart the servers.
4. If something looks broken, check the terminal windows for red error text — it usually points to the exact file and line with the problem.

Once you're happy with a change, if the project is connected to GitHub, you'll want to save ("commit") and upload ("push") it so it can be deployed. If you're not comfortable with git commands, ask whoever manages deployment for you, or ask Claude Code to do it — just say what you changed and ask it to commit and push.

## Deployment (putting it on the real internet)

Right now, this project runs only on your own computer ("local development"). Making it available at a real web address for anyone to visit requires two separate deployments — one for the backend, one for the frontend — since they're built differently.

### Recommended hosting

| Piece | Recommended host | Why |
|---|---|---|
| Backend (Python server) | [Railway](https://railway.app) (~$5/month) | Runs the server continuously (no "cold start" delay when someone visits); a `Dockerfile` is already included and ready to use |
| Frontend (map website) | [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) (free) | Both auto-deploy a static site whenever you push to GitHub |

### Before deploying to the public, for real (checklist)

- [ ] Swap the light-mode map tile URL in `frontend/src/components/Map.tsx` (see [above](#change-the-maps-colors--style-light-and-dark-mode-tiles)) from the free OpenStreetMap tile to a CDN-backed provider (MapTiler or Stadia Maps free tier). OpenStreetMap's free tiles are meant for light personal use and can get you rate-limited under real traffic.
- [ ] Deploy the backend (`/backend`) to Railway — it already has a `Dockerfile`, so Railway can build and run it with no extra configuration.
- [ ] Deploy the frontend (`/frontend`) to Vercel or Cloudflare Pages, pointing its `/api/*` requests at your deployed backend's URL instead of `localhost:8000`.
- [ ] Decide on a final project name (this is currently a working title — "Metro" branding can't be used in the final name since it's not an official Metro product) and a domain, if desired.

If you'd like step-by-step deployment help (creating a Railway/Vercel account, connecting GitHub, setting environment variables), ask Claude Code to walk you through it interactively — it's easiest to do live rather than follow a static list, since exact screens change over time.

## Keeping the data up to date

Metro republishes its official route/schedule data (called the "static GTFS feed") periodically — the current one is valid **March 1 – May 30, 2026**. A new one is expected around **June 1, 2026**.

To check whether the data is still current, or to refresh it:

```bash
python3 validate_feed.py --all
```

This checks both the live feed (bus positions) and the static feed (routes/schedules) and reports whether they're working and up to date. If Metro has published a new static feed, re-run the processing script to regenerate the map's route lines and stop points:

```bash
python3 scripts/process_gtfs.py
```

This is a one-time/occasional task, not something you need to do often — expect to run it roughly every 3 months when Metro updates their schedule data.

## Project structure reference

```
CincyBusTrackr/
├── backend/
│   ├── app/
│   │   ├── main.py          # The server itself — defines /api/vehicles, /api/routes, /api/health, /api/alerts
│   │   ├── feed.py          # Polls Metro's live feed every 30s, figures out next-stop ETAs
│   │   ├── gtfs_static.py   # Loads route names, trip destinations, and stop names
│   │   └── models.py        # Defines the shape of the data sent to the frontend
│   ├── requirements.txt     # List of Python packages needed
│   └── Dockerfile           # Instructions for building the backend for deployment
├── frontend/
│   └── src/
│       ├── App.tsx           # Top-level app logic — URL sharing, dark mode, filtering
│       ├── constants.ts      # Small tunable settings, like refresh rate
│       └── components/
│           ├── Map.tsx        # The map itself — icons, animation, popups, tile styles
│           ├── RouteSelector.tsx  # The route/category picker menu
│           ├── AlertsBar.tsx      # The service-alerts banner
│           └── StatusBar.tsx      # The bottom status strip and disclaimer text
├── static/
│   ├── routes.geojson        # Pre-generated route lines shown on the map
│   └── stops.geojson         # Pre-generated bus stop locations
├── scripts/
│   └── process_gtfs.py       # Regenerates the two files above from Metro's official data
├── config/
│   └── route_categories.json # Which category (Core/Major/Minor/Commuter/Express) each route belongs to
├── validate_feed.py          # Checks that Metro's data feeds are still working/current
├── roadmap.html              # Open this in a browser to see planned features (checkboxes save automatically)
└── dev.sh                    # One command to start both servers for local testing
```

## Glossary

- **GTFS** — "General Transit Feed Specification," the standard format transit agencies (including Metro) use to publish route, schedule, and live vehicle data.
- **GTFS-RT** — the "real-time" part of GTFS: live bus positions, delays, and alerts, updated continuously.
- **Backend** — the part of the app that runs on a server, out of view, handling data.
- **Frontend** — the part of the app that runs in your browser — what you actually see and click on.
- **Repo (repository)** — the project's folder, tracked by git, usually hosted on GitHub.
- **Commit / push** — "commit" saves a snapshot of your changes; "push" uploads that snapshot to GitHub so others (and deployment services) can see it.
- **Deploy** — putting the app on a real server so it's reachable at a public web address, instead of only running on your own computer.
- **Tile provider** — a service that supplies the map imagery (roads, labels, terrain) shown underneath the bus icons.

## Getting help / troubleshooting

- **"command not found: python3" or "command not found: node"** — Python or Node.js isn't installed, or wasn't added to your system PATH. Re-run their installers and make sure to check any "Add to PATH" option.
- **Backend won't start / port already in use** — something else is already using port 8000. Close other terminal windows running the project, or restart your computer.
- **Frontend shows a blank map or "failed to fetch"** — make sure the backend terminal is still running and shows no errors; the frontend depends on it.
- **Changed a file but don't see the change** — make sure you saved the file, then refresh the browser tab. If that doesn't work, stop (`Ctrl+C`) and restart `./dev.sh`.
- **Anything else** — open this project folder in Claude Code and describe what you're trying to do in plain English (e.g. "I want the bus icons to be bigger" or "the map looks broken after my edit") — you don't need to know exactly which file to change.

## Roadmap

See [`roadmap.html`](roadmap.html) — open it in a browser (checkbox state persists via localStorage, so it remembers what's done).
