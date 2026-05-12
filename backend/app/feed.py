import asyncio
import logging
import math
import re
import time
from typing import Optional

import httpx
from google.transit import gtfs_realtime_pb2

from .models import Alert, AlertsResponse, HealthStatus, VehiclePosition

log = logging.getLogger(__name__)

GTFS_RT_URL = (
    "https://tmgtfsprd.sorttrpcloud.com"
    "/TMGTFSRealTimeWebService/gtfs-realtime/trapezerealtimefeed.pb"
)
ALERTS_URL = (
    "https://tmgtfsprd.sorttrpcloud.com"
    "/TMGTFSRealTimeWebService/alert/alerts.pb"
)
STALE_SECONDS = 300
MIN_MOVE_METERS = 5.0
ALERTS_CACHE_SECONDS = 60


def _classify_inbound(headsign: Optional[str]) -> Optional[bool]:
    if not headsign:
        return None
    return "downtown" in headsign.lower()


def _extract_variant(headsign: Optional[str]) -> Optional[str]:
    """Derive trip variant suffix from headsign, e.g. 'Route - A' → 'A', 'Short' → 'S'."""
    if not headsign:
        return None
    m = re.search(r"\s*-\s*([A-Z])\s*$", headsign)
    if m:
        return m.group(1)
    if re.search(r"\bShort\b", headsign, re.IGNORECASE):
        return "S"
    return None


def _get_translation(translations) -> str:
    """Return English (or first available) translation text."""
    for t in translations:
        if not t.language or t.language.startswith("en"):
            return t.text
    return translations[0].text if translations else ""


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class FeedPoller:
    def __init__(self, gtfs_static, poll_interval: int = 30) -> None:
        self._gtfs = gtfs_static
        self._interval = poll_interval
        self._vehicles: list[VehiclePosition] = []
        self._feed_timestamp: Optional[int] = None
        self._fetched_at: Optional[float] = None
        self._consecutive_failures: int = 0
        self._prev_positions: dict[str, tuple[float, float]] = {}
        self._prev_bearings: dict[str, float] = {}
        self._task: Optional[asyncio.Task] = None
        self._alerts: list[Alert] = []
        self._alerts_fetched_at: Optional[float] = None

    @property
    def vehicles(self) -> list[VehiclePosition]:
        return self._vehicles

    @property
    def feed_timestamp(self) -> Optional[int]:
        return self._feed_timestamp

    @property
    def fetched_at(self) -> Optional[float]:
        return self._fetched_at

    @property
    def health(self) -> HealthStatus:
        feed_age = None
        if self._feed_timestamp:
            feed_age = time.time() - self._feed_timestamp

        if self._consecutive_failures == 0 and self._fetched_at:
            status = "ok"
        elif self._consecutive_failures < 3:
            status = "degraded"
        else:
            status = "down"

        return HealthStatus(
            status=status,
            last_fetch_time=self._fetched_at,
            consecutive_failures=self._consecutive_failures,
            vehicle_count=len(self._vehicles),
            feed_age_seconds=feed_age,
        )

    def start(self) -> None:
        self._task = asyncio.create_task(self._poll_loop())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self._fetch_once()
            except Exception as exc:
                self._consecutive_failures += 1
                log.error("Feed fetch failed (#%d): %s", self._consecutive_failures, exc)
            await asyncio.sleep(self._interval)

    async def _fetch_once(self) -> None:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                GTFS_RT_URL,
                headers={"User-Agent": "CincyBusTrackr/1.0"},
            )
        resp.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(resp.content)

        now = time.time()

        # First pass: collect next stops from trip_update entities
        trip_next_stops: dict[str, tuple[str, Optional[int]]] = {}
        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue
            tu = entity.trip_update
            if not tu.HasField("trip"):
                continue
            trip_id = tu.trip.trip_id
            if not trip_id:
                continue
            for stu in tu.stop_time_update:
                eta: Optional[int] = None
                if stu.HasField("arrival") and stu.arrival.time:
                    eta = int(stu.arrival.time)
                elif stu.HasField("departure") and stu.departure.time:
                    eta = int(stu.departure.time)
                # Accept stops that are upcoming or very recently passed (2 min tolerance)
                if eta is None or eta > now - 120:
                    trip_next_stops[trip_id] = (stu.stop_id, eta)
                    break

        # Second pass: vehicle positions
        vehicles: list[VehiclePosition] = []
        new_positions: dict[str, tuple[float, float]] = {}
        new_bearings: dict[str, float] = {}

        for entity in feed.entity:
            if not entity.HasField("vehicle"):
                continue
            v = entity.vehicle
            if not v.HasField("position"):
                continue

            pos = v.position
            trip = v.trip if v.HasField("trip") else None
            vehicle_id = (
                (v.vehicle.id or entity.id) if v.HasField("vehicle") else entity.id
            )
            route_id = trip.route_id if trip else ""
            trip_id = trip.trip_id if trip else ""
            lat, lon = pos.latitude, pos.longitude

            bearing: Optional[float] = float(pos.bearing) if pos.HasField("bearing") else None
            if bearing is None and vehicle_id in self._prev_positions:
                prev_lat, prev_lon = self._prev_positions[vehicle_id]
                if _haversine_m(prev_lat, prev_lon, lat, lon) >= MIN_MOVE_METERS:
                    bearing = _bearing(prev_lat, prev_lon, lat, lon)
                else:
                    bearing = self._prev_bearings.get(vehicle_id)
            if bearing is not None:
                new_bearings[vehicle_id] = bearing

            speed: Optional[float] = float(pos.speed) if pos.HasField("speed") else None

            direction_id: Optional[int] = None
            if trip:
                try:
                    direction_id = trip.direction_id if trip.HasField("direction_id") else None
                except ValueError:
                    direction_id = None

            ts = v.timestamp or None
            stale = bool(ts and (now - ts) > STALE_SECONDS)

            headsign = self._gtfs.get_headsign(trip_id) if trip_id else None
            route_info = self._gtfs.get_route(route_id) if route_id else None

            next_stop_id, next_stop_eta = trip_next_stops.get(trip_id, (None, None))
            next_stop_name = self._gtfs.get_stop_name(next_stop_id) if next_stop_id else None

            vehicles.append(
                VehiclePosition(
                    vehicle_id=vehicle_id,
                    route_id=route_id,
                    trip_id=trip_id,
                    lat=lat,
                    lon=lon,
                    bearing=bearing,
                    speed=speed,
                    direction_id=direction_id,
                    inbound=_classify_inbound(headsign),
                    timestamp=ts,
                    stale=stale,
                    headsign=headsign,
                    route_short_name=route_info["route_short_name"] if route_info else None,
                    route_color=route_info["route_color"] if route_info else None,
                    route_text_color=route_info["route_text_color"] if route_info else None,
                    next_stop_name=next_stop_name,
                    next_stop_eta=next_stop_eta,
                    trip_variant=_extract_variant(headsign),
                )
            )

            new_positions[vehicle_id] = (lat, lon)

        self._vehicles = vehicles
        self._feed_timestamp = feed.header.timestamp or None
        self._fetched_at = now
        self._consecutive_failures = 0
        self._prev_positions = new_positions
        self._prev_bearings = new_bearings

        log.info("Feed updated: %d vehicles, feed_ts=%s", len(vehicles), self._feed_timestamp)

    async def get_alerts(self) -> AlertsResponse:
        """Return cached alerts, refreshing if the cache is stale."""
        if not self._alerts_fetched_at or time.time() - self._alerts_fetched_at > ALERTS_CACHE_SECONDS:
            await self._fetch_alerts()
        return AlertsResponse(alerts=self._alerts, fetched_at=self._alerts_fetched_at)

    async def _fetch_alerts(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    ALERTS_URL,
                    headers={"User-Agent": "CincyBusTrackr/1.0"},
                )
            resp.raise_for_status()

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(resp.content)

            alerts: list[Alert] = []
            for entity in feed.entity:
                if not entity.HasField("alert"):
                    continue
                a = entity.alert
                header = _get_translation(a.header_text.translation)
                if not header:
                    continue
                description = _get_translation(a.description_text.translation) or None
                try:
                    effect = gtfs_realtime_pb2.Alert.Effect.Name(a.effect) or None
                except ValueError:
                    effect = None
                route_ids = [ie.route_id for ie in a.informed_entity if ie.route_id]
                alerts.append(Alert(
                    id=entity.id,
                    header=header,
                    description=description,
                    effect=effect,
                    route_ids=route_ids,
                ))

            self._alerts = alerts
            self._alerts_fetched_at = time.time()
            log.info("Alerts updated: %d alerts", len(alerts))

        except Exception as exc:
            log.warning("Alerts fetch failed: %s", exc)
            self._alerts_fetched_at = time.time()  # Suppress retry for cache interval
