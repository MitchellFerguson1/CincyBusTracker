# CincyBusTrackr

A real-time Cincinnati Metro bus tracker. View all 50 routes and both directions at once — something Metro's own (now-defunct) tool never supported.

Inspired by [TrainTrackr.io](https://traintrackr.io). Data sourced from SORTA's public GTFS-RT feed.

---

## Features

- **Live vehicle positions** — refreshed every 30 seconds from SORTA's GTFS-RT feed
- **All 50 routes simultaneously** — filter by route category (Core / Major / Minor / Commuter / Express) and direction
- **Smooth animation** — vehicles interpolate position between feed updates via a requestAnimationFrame loop
- **Click-to-inspect** — tap any bus to see its route, headsign, trip variant, next stop, and ETA
- **Service alerts** — collapsible banner sourced from the GTFS-RT alerts feed
- **Dark mode** — toggle between light (OSM) and dark (CARTO Dark Matter) tile sets
- **URL state sharing** — `?routes=4,43&dir=inbound` links are bookmarkable and shareable

## Stack

| Layer | Technology |
|---|---|
| Map | [MapLibre GL JS](https://maplibre.org/) |
| Frontend | React 19 + TypeScript + Vite |
| Backend | Python + FastAPI + uvicorn |
| GTFS parsing | [gtfs-realtime-bindings](https://github.com/MobilityData/gtfs-realtime-bindings) |
| Static data | GTFS ZIP from go-metro.com |

## Local Development

**Prerequisites:** Python 3.11+, Node.js 20+

```bash
# Clone
git clone git@github.com:MitchellFerguson1/CincyBusTracker.git
cd CincyBusTracker

# Backend (port 8000)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (port 5173, proxies /api/* → 8000)
cd frontend
npm install
npm run dev
```

Or use the convenience script from the repo root (starts backend, waits for health check, then starts frontend):

```bash
./dev.sh
```

## Project Structure

```
CincyBusTrackr/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app — /api/vehicles, /api/routes, /api/health, /api/alerts
│   │   ├── feed.py          # GTFS-RT poller (30 s cache), trip_update ETA parsing
│   │   ├── gtfs_static.py   # Static GTFS loader — trips, routes, stops
│   │   └── models.py        # Pydantic models
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/
│       ├── App.tsx           # URL state, dark mode, vehicle filtering
│       └── components/
│           ├── Map.tsx        # MapLibre map, rAF animation, click popover
│           ├── RouteSelector.tsx
│           ├── AlertsBar.tsx
│           └── StatusBar.tsx
├── static/
│   ├── routes.geojson        # 50 route polylines (RDP-simplified)
│   └── stops.geojson         # 3,743 stops
├── scripts/
│   └── process_gtfs.py       # One-time script: GTFS ZIP → GeoJSON + route categories
├── config/
│   └── route_categories.json # Route classification (Core / Major / Minor / Commuter / Express)
└── dev.sh                    # Start backend + frontend together
```

## Data Sources

- **GTFS-RT (vehicles + alerts):** SORTA/Metro public feed — no auth required
- **GTFS Static (routes, trips, stops):** `go-metro.com` — updated quarterly
- **Map tiles:** OpenStreetMap (light) / CARTO Dark Matter (dark)

> This project is not affiliated with or endorsed by SORTA or Cincinnati Metro.

## Roadmap

See [`roadmap.html`](roadmap.html) (open in browser — checkbox state persists via localStorage).
