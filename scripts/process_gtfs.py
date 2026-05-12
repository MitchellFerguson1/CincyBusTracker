#!/usr/bin/env python3
"""
CincyBusTrackr — GTFS Static → GeoJSON Processor
Run quarterly after each GTFS static feed update (~June 1, Sep 1, Dec 1, Mar 1).

Outputs:
  static/routes.geojson   — simplified LineString per route shape
  static/stops.geojson    — Point per stop
  config/route_categories.json  — generated template if it doesn't exist

Usage:
  pip install requests
  python scripts/process_gtfs.py
"""

import csv
import io
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import requests

STATIC_FEED_URL = "https://go-metro.com/uploads/GTFS/google_transit_info.zip"
PROJECT_ROOT = Path(__file__).parent.parent
STATIC_DIR = PROJECT_ROOT / "static"
CONFIG_DIR = PROJECT_ROOT / "config"

RDP_TOLERANCE = 0.0001  # ~11m at Cincinnati's latitude; good tradeoff for zoom 10-14


# ── Ramer–Douglas–Peucker simplification ─────────────────────────────────────

def _rdp(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points

    def dist(p, a, b):
        if a == b:
            return ((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2) ** 0.5
        t = max(0.0, min(1.0, (
            (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])
        ) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)))
        proj = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        return ((p[0] - proj[0]) ** 2 + (p[1] - proj[1]) ** 2) ** 0.5

    max_dist, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        d = dist(points[i], points[0], points[-1])
        if d > max_dist:
            max_dist, idx = d, i

    if max_dist > epsilon:
        left = _rdp(points[: idx + 1], epsilon)
        right = _rdp(points[idx:], epsilon)
        return left[:-1] + right
    return [points[0], points[-1]]


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    STATIC_DIR.mkdir(exist_ok=True)
    CONFIG_DIR.mkdir(exist_ok=True)

    print(f"Downloading GTFS static feed…")
    resp = requests.get(
        STATIC_FEED_URL,
        timeout=60,
        headers={"User-Agent": "CincyBusTrackr/1.0"},
    )
    resp.raise_for_status()
    print(f"  {len(resp.content):,} bytes received")

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        print(f"  Files: {', '.join(zf.namelist())}")
        _process_routes_and_shapes(zf)
        _process_stops(zf)
        _generate_categories_template(zf)

    print("\nAll done.")
    print(f"  {STATIC_DIR / 'routes.geojson'}")
    print(f"  {STATIC_DIR / 'stops.geojson'}")
    print(f"  {CONFIG_DIR / 'route_categories.json'}")
    print("\nNext: edit config/route_categories.json to assign Core/Major/Minor/Commuter/Express.")
    print("Then restart the backend so it picks up the new categories.")


def _process_routes_and_shapes(zf: zipfile.ZipFile) -> None:
    print("\n[1/3] Building route GeoJSON…")

    # Load routes
    with zf.open("routes.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        routes = {row["route_id"]: row for row in reader}
    print(f"  {len(routes)} routes")

    # Load shape points
    shape_pts: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    with zf.open("shapes.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        for row in reader:
            shape_pts[row["shape_id"]].append((
                int(row["shape_pt_sequence"]),
                float(row["shape_pt_lat"]),
                float(row["shape_pt_lon"]),
            ))
    print(f"  {len(shape_pts)} shapes")

    # Sort by sequence, convert to [lon, lat] for GeoJSON
    shapes: dict[str, list[tuple[float, float]]] = {}
    for sid, pts in shape_pts.items():
        pts.sort(key=lambda p: p[0])
        shapes[sid] = [(p[2], p[1]) for p in pts]

    # Map route_id → shape_ids via trips.txt
    route_shape_ids: dict[str, set[str]] = defaultdict(set)
    with zf.open("trips.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        for row in reader:
            if row.get("shape_id"):
                route_shape_ids[row["route_id"]].add(row["shape_id"])

    features = []
    total_before = total_after = 0

    for route_id, route in routes.items():
        color = route.get("route_color", "").strip() or "1a6dba"
        text_color = route.get("route_text_color", "").strip() or "ffffff"
        if not color.startswith("#"):
            color = f"#{color}"
        if not text_color.startswith("#"):
            text_color = f"#{text_color}"

        for shape_id in route_shape_ids.get(route_id, set()):
            coords = shapes.get(shape_id, [])
            if not coords:
                continue
            before = len(coords)
            simplified = _rdp(coords, RDP_TOLERANCE)
            total_before += before
            total_after += len(simplified)
            features.append({
                "type": "Feature",
                "properties": {
                    "route_id": route_id,
                    "shape_id": shape_id,
                    "route_short_name": route.get("route_short_name", ""),
                    "route_long_name": route.get("route_long_name", ""),
                    "route_color": color,
                    "route_text_color": text_color,
                },
                "geometry": {"type": "LineString", "coordinates": simplified},
            })

    pct = 100 * (1 - total_after / max(total_before, 1))
    print(f"  Simplified {total_before:,} → {total_after:,} points ({pct:.0f}% reduction)")
    print(f"  {len(features)} line features")

    out = STATIC_DIR / "routes.geojson"
    with open(out, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    print(f"  Written: {out}  ({out.stat().st_size / 1024:.0f} KB)")


def _process_stops(zf: zipfile.ZipFile) -> None:
    print("\n[2/3] Building stops GeoJSON…")
    features = []
    with zf.open("stops.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        for row in reader:
            features.append({
                "type": "Feature",
                "properties": {
                    "stop_id": row["stop_id"],
                    "stop_name": row.get("stop_name", ""),
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(row["stop_lon"]), float(row["stop_lat"])],
                },
            })
    print(f"  {len(features)} stops")
    out = STATIC_DIR / "stops.geojson"
    with open(out, "w") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
    print(f"  Written: {out}  ({out.stat().st_size / 1024:.0f} KB)")


def _generate_categories_template(zf: zipfile.ZipFile) -> None:
    print("\n[3/3] Generating route category template…")
    out = CONFIG_DIR / "route_categories.json"
    if out.exists():
        print(f"  {out} already exists — skipping (delete it to regenerate)")
        return

    with zf.open("routes.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
        rows = sorted(list(reader), key=lambda r: r.get("route_short_name", ""))

    categories = {}
    print(f"  {'ID':>8}  {'Short':>6}  {'Long':<45}  Category")
    print(f"  {'-'*8}  {'-'*6}  {'-'*45}  --------")
    for row in rows:
        route_id = row["route_id"]
        long_name = row.get("route_long_name", "").lower()
        # Auto-detect Express/Commuter from name; everything else needs manual review
        if "express" in long_name:
            cat = "Express"
        elif "commuter" in long_name:
            cat = "Commuter"
        else:
            cat = "Uncategorized"
        categories[route_id] = cat
        print(f"  {route_id:>8}  {row.get('route_short_name',''):>6}  {row.get('route_long_name','')[:45]:<45}  {cat}")

    with open(out, "w") as f:
        json.dump(categories, f, indent=2, sort_keys=True)
    print(f"\n  Written: {out}")
    print("  → Assign Core/Major/Minor/Commuter/Express to each route_id")


if __name__ == "__main__":
    main()
