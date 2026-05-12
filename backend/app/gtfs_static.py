import csv
import io
import json
import logging
import zipfile
from pathlib import Path
from typing import Optional

import requests

log = logging.getLogger(__name__)

STATIC_FEED_URL = "https://go-metro.com/uploads/GTFS/google_transit_info.zip"
CATEGORIES_FILE = Path(__file__).parent.parent.parent / "config" / "route_categories.json"


class GTFSStatic:
    def __init__(self) -> None:
        self.trip_headsigns: dict[str, str] = {}
        self.routes: dict[str, dict] = {}
        self.stop_names: dict[str, str] = {}

    def load(self) -> None:
        categories = self._load_categories()
        log.info("Downloading GTFS static feed…")
        resp = requests.get(
            STATIC_FEED_URL,
            timeout=60,
            headers={"User-Agent": "CincyBusTrackr/1.0"},
        )
        resp.raise_for_status()

        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            self._parse_trips(zf)
            self._parse_routes(zf, categories)
            self._parse_stops(zf)

        log.info(
            "GTFS static loaded: %d headsigns, %d routes, %d stops",
            len(self.trip_headsigns),
            len(self.routes),
            len(self.stop_names),
        )

    def _load_categories(self) -> dict[str, str]:
        try:
            with open(CATEGORIES_FILE) as f:
                return json.load(f)
        except FileNotFoundError:
            log.warning("config/route_categories.json not found — run scripts/process_gtfs.py first")
            return {}

    def _parse_trips(self, zf: zipfile.ZipFile) -> None:
        with zf.open("trips.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                trip_id = row.get("trip_id", "").strip()
                headsign = row.get("trip_headsign", "").strip()
                if trip_id:
                    self.trip_headsigns[trip_id] = headsign

    def _parse_routes(self, zf: zipfile.ZipFile, categories: dict[str, str]) -> None:
        with zf.open("routes.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                route_id = row.get("route_id", "").strip()
                if not route_id:
                    continue
                color = row.get("route_color", "").strip() or "1a6dba"
                text_color = row.get("route_text_color", "").strip() or "ffffff"
                self.routes[route_id] = {
                    "route_id": route_id,
                    "route_short_name": row.get("route_short_name", "").strip(),
                    "route_long_name": row.get("route_long_name", "").strip(),
                    "route_color": f"#{color}" if not color.startswith("#") else color,
                    "route_text_color": f"#{text_color}" if not text_color.startswith("#") else text_color,
                    "category": categories.get(route_id, "Uncategorized"),
                }

    def _parse_stops(self, zf: zipfile.ZipFile) -> None:
        with zf.open("stops.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                stop_id = row.get("stop_id", "").strip()
                stop_name = row.get("stop_name", "").strip()
                if stop_id and stop_name:
                    self.stop_names[stop_id] = stop_name

    def get_headsign(self, trip_id: str) -> Optional[str]:
        return self.trip_headsigns.get(trip_id)

    def get_route(self, route_id: str) -> Optional[dict]:
        return self.routes.get(route_id)

    def get_stop_name(self, stop_id: str) -> Optional[str]:
        return self.stop_names.get(stop_id)

    def all_routes(self) -> list[dict]:
        return list(self.routes.values())
