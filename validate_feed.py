#!/usr/bin/env python3
"""
CincyBusTrackr — GTFS-RT Feed Validation Script
Answers blocking questions from the PRD before any development begins:
  1. Is the feed accessible without authentication?
  2. Does it include bearing/heading for directional icons?
  3. What is the actual update frequency of the feed?
  4. How are variant trips represented (headsign, trip_id patterns)?
  5. Are route_color values present in the static feed?

Usage:
  pip install gtfs-realtime-bindings requests
  python validate_feed.py
  python validate_feed.py --poll   # polls twice 30s apart to measure update frequency
"""

import argparse
import time
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

import requests

GTFS_RT_URL = (
    "https://tmgtfsprd.sorttrpcloud.com"
    "/TMGTFSRealTimeWebService/gtfs-realtime/trapezerealtimefeed.pb"
)
GTFS_STATIC_URL = (
    "https://go-metro.com/uploads/GTFS/google_transit_info.zip"
)

HEADERS = {"User-Agent": "CincyBusTrackr-Validator/1.0"}


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_feed(url: str) -> bytes:
    print(f"\nFetching: {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        print(f"  HTTP {resp.status_code}  |  {len(resp.content):,} bytes")
        return resp.content
    except requests.exceptions.HTTPError as e:
        print(f"  ERROR: HTTP {e.response.status_code} — {e}")
        sys.exit(1)
    except requests.exceptions.ConnectionError as e:
        print(f"  ERROR: Connection failed — {e}")
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("  ERROR: Request timed out")
        sys.exit(1)


# ── Parse GTFS-RT ─────────────────────────────────────────────────────────────

def parse_gtfs_rt(raw: bytes):
    try:
        from google.transit import gtfs_realtime_pb2
    except ImportError:
        print("\nERROR: gtfs-realtime-bindings not installed.")
        print("  Run: pip install gtfs-realtime-bindings requests")
        sys.exit(1)

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(raw)
    return feed


def analyze_feed(feed) -> dict:
    results = {
        "feed_timestamp": None,
        "total_entities": 0,
        "vehicle_positions": 0,
        "trip_updates": 0,
        "has_bearing": False,
        "has_speed": False,
        "bearing_count": 0,
        "speed_count": 0,
        "route_ids": set(),
        "headsigns": [],
        "trip_ids": [],
        "vehicles": [],
    }

    if feed.header.HasField("timestamp") and feed.header.timestamp:
        results["feed_timestamp"] = datetime.fromtimestamp(
            feed.header.timestamp, tz=timezone.utc
        )

    results["total_entities"] = len(feed.entity)

    for entity in feed.entity:
        if entity.HasField("vehicle"):
            v = entity.vehicle
            results["vehicle_positions"] += 1

            pos = v.position if v.HasField("position") else None
            trip = v.trip if v.HasField("trip") else None

            # trip_headsign is not a standard GTFS-RT TripDescriptor field;
            # headsign lives in the static feed. Some vendors include it as
            # an extension — check for it safely.
            headsign = getattr(trip, "trip_headsign", None) if trip else None

            vehicle_info = {
                "entity_id": entity.id,
                "lat": pos.latitude if pos else None,
                "lon": pos.longitude if pos else None,
                "bearing": None,
                "speed": None,
                "route_id": trip.route_id if trip else None,
                "trip_id": trip.trip_id if trip else None,
                "direction_id": trip.direction_id if trip else None,
                "headsign": headsign if headsign else None,
                "vehicle_id": v.vehicle.id if (v.HasField("vehicle") and v.vehicle.id) else None,
                "vehicle_label": v.vehicle.label if (v.HasField("vehicle") and v.vehicle.label) else None,
                "timestamp": datetime.fromtimestamp(v.timestamp, tz=timezone.utc) if v.timestamp else None,
            }

            if pos and pos.bearing:
                results["has_bearing"] = True
                results["bearing_count"] += 1
                vehicle_info["bearing"] = pos.bearing

            if pos and pos.speed:
                results["has_speed"] = True
                results["speed_count"] += 1
                vehicle_info["speed"] = pos.speed

            if trip and trip.route_id:
                results["route_ids"].add(trip.route_id)
            if headsign:
                results["headsigns"].append(headsign)
            if trip and trip.trip_id:
                results["trip_ids"].append(trip.trip_id)

            results["vehicles"].append(vehicle_info)

        if entity.HasField("trip_update"):
            results["trip_updates"] += 1

    return results


# ── Static Feed ───────────────────────────────────────────────────────────────

def check_static_feed():
    """Download and inspect routes.txt for route_color field."""
    import io
    import zipfile
    import csv

    print("\n── Static GTFS Feed ─────────────────────────────────────")
    raw = fetch_feed(GTFS_STATIC_URL)

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        print("  ERROR: Not a valid ZIP file")
        return

    print(f"  Files in feed: {', '.join(zf.namelist())}")

    # Check routes.txt for route_color
    if "routes.txt" in zf.namelist():
        with zf.open("routes.txt") as f:
            reader = csv.DictReader(f.read().decode("utf-8-sig").splitlines())
            routes = list(reader)
        has_color = "route_color" in reader.fieldnames
        print(f"\n  routes.txt: {len(routes)} routes, route_color field: {'YES' if has_color else 'NO'}")
        if has_color:
            colored = [r for r in routes if r.get("route_color", "").strip()]
            print(f"  Routes with non-empty route_color: {len(colored)} / {len(routes)}")
            if colored:
                print("  Sample colors:")
                for r in colored[:5]:
                    print(f"    Route {r.get('route_short_name','?'):>4} ({r.get('route_long_name','')[:30]:<30}) → #{r['route_color']}")

    # Check feed_info.txt for active period
    if "feed_info.txt" in zf.namelist():
        with zf.open("feed_info.txt") as f:
            reader = csv.DictReader(f.read().decode("utf-8-sig").splitlines())
            for row in reader:
                print(f"\n  Feed active: {row.get('feed_start_date','?')} → {row.get('feed_end_date','?')}")

    # Spot-check trips.txt for headsign patterns
    if "trips.txt" in zf.namelist():
        with zf.open("trips.txt") as f:
            reader = csv.DictReader(f.read().decode("utf-8-sig").splitlines())
            trips = list(reader)
        has_headsign = "trip_headsign" in reader.fieldnames
        print(f"\n  trips.txt: {len(trips):,} trips, trip_headsign field: {'YES' if has_headsign else 'NO'}")
        if has_headsign:
            headsigns = Counter(t.get("trip_headsign", "") for t in trips)
            print("  Most common headsigns:")
            for hs, count in headsigns.most_common(10):
                print(f"    {count:>4}×  {hs}")


# ── Report ────────────────────────────────────────────────────────────────────

def print_report(results: dict, poll_delta_seconds: float = None):
    print("\n── GTFS-RT Feed Analysis ────────────────────────────────")

    ts = results["feed_timestamp"]
    if ts:
        age = (datetime.now(tz=timezone.utc) - ts).total_seconds()
        print(f"  Feed timestamp : {ts.strftime('%Y-%m-%d %H:%M:%S UTC')}  ({age:.0f}s ago)")
    else:
        print("  Feed timestamp : NOT PRESENT")

    print(f"  Total entities : {results['total_entities']}")
    print(f"  Vehicle positions : {results['vehicle_positions']}")
    print(f"  Trip updates      : {results['trip_updates']}")
    print(f"  Active routes     : {len(results['route_ids'])}")

    print(f"\n── Q1: Bearing/heading present? ─────────────────────────")
    if results["has_bearing"]:
        pct = 100 * results["bearing_count"] / max(results["vehicle_positions"], 1)
        print(f"  YES — {results['bearing_count']} / {results['vehicle_positions']} vehicles have bearing ({pct:.0f}%)")
        print("  Directional pentagon icons: FEASIBLE without fallback math")
    else:
        print("  NO — bearing field absent or zero for all vehicles")
        print("  Directional icons require inferring heading from sequential position deltas")

    if results["has_speed"]:
        print(f"  Speed data also present ({results['speed_count']} vehicles)")

    if poll_delta_seconds is not None:
        print(f"\n── Q2: Feed update frequency ────────────────────────────")
        print(f"  Measured position changes between two polls ~30s apart")
        print(f"  → See poll comparison output above")

    print(f"\n── Q3: Headsign / variant trip inspection ───────────────")
    if results["headsigns"]:
        unique = Counter(results["headsigns"])
        print(f"  {len(unique)} unique headsigns across {len(results['headsigns'])} vehicles")
        print("  Sample headsigns (most common):")
        for hs, count in unique.most_common(15):
            print(f"    {count:>3}×  {hs}")
    else:
        print("  NO headsign data in vehicle positions (may be in trip_updates)")

    print(f"\n── Sample Vehicle Positions ─────────────────────────────")
    sample = results["vehicles"][:8]
    for v in sample:
        dir_label = {0: "outbound", 1: "inbound"}.get(v.get("direction_id"), "dir=?")
        parts = [
            f"Route {v['route_id'] or '?':>4}",
            dir_label,
            f"({v['lat']:.4f}, {v['lon']:.4f})" if v["lat"] else "(no pos)",
            f"bearing={v['bearing']:.0f}°" if v["bearing"] is not None else "no bearing",
            f"trip={v['trip_id']}" if v["trip_id"] else "",
        ]
        print("  " + "  ".join(p for p in parts if p))


# ── Poll comparison ───────────────────────────────────────────────────────────

def poll_twice(interval: int = 30):
    print(f"\nPolling feed twice with {interval}s interval to measure update frequency…")

    raw1 = fetch_feed(GTFS_RT_URL)
    feed1 = parse_gtfs_rt(raw1)
    r1 = analyze_feed(feed1)
    positions1 = {v["entity_id"]: (v["lat"], v["lon"]) for v in r1["vehicles"]}

    print(f"  Poll 1: {r1['vehicle_positions']} vehicles at {datetime.now().strftime('%H:%M:%S')}")
    print(f"  Waiting {interval}s…")
    time.sleep(interval)

    raw2 = fetch_feed(GTFS_RT_URL)
    feed2 = parse_gtfs_rt(raw2)
    r2 = analyze_feed(feed2)
    positions2 = {v["entity_id"]: (v["lat"], v["lon"]) for v in r2["vehicles"]}

    print(f"  Poll 2: {r2['vehicle_positions']} vehicles at {datetime.now().strftime('%H:%M:%S')}")

    moved = sum(
        1 for eid, pos in positions2.items()
        if eid in positions1 and pos != positions1[eid]
    )
    appeared = len(set(positions2) - set(positions1))
    disappeared = len(set(positions1) - set(positions2))

    print(f"\n  Vehicles that moved    : {moved}")
    print(f"  New vehicles appeared  : {appeared}")
    print(f"  Vehicles dropped       : {disappeared}")

    if r1["feed_timestamp"] and r2["feed_timestamp"]:
        delta = (r2["feed_timestamp"] - r1["feed_timestamp"]).total_seconds()
        print(f"  Feed timestamp delta   : {delta:.0f}s  (actual feed refresh cadence)")
    elif moved > 0:
        print(f"  Feed is live — positions changed between polls")
    else:
        print(f"  No position changes observed — feed may be cached or buses stationary")

    return r2


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Validate CincyBusTrackr data feeds")
    parser.add_argument("--poll", action="store_true", help="Poll GTFS-RT twice to measure update frequency")
    parser.add_argument("--static", action="store_true", help="Also check GTFS static feed (routes, colors, headsigns)")
    parser.add_argument("--all", action="store_true", help="Run all checks including static feed and poll")
    args = parser.parse_args()

    print("=" * 58)
    print("  CincyBusTrackr — Feed Validation")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 58)

    if args.poll or args.all:
        results = poll_twice()
    else:
        raw = fetch_feed(GTFS_RT_URL)
        feed = parse_gtfs_rt(raw)
        results = analyze_feed(feed)

    print_report(results)

    if args.static or args.all:
        check_static_feed()

    print("\n" + "=" * 58)
    print("  Done. Address any ERRORs above before proceeding.")
    print("=" * 58 + "\n")


if __name__ == "__main__":
    main()
