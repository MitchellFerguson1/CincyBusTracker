import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .feed import FeedPoller
from .gtfs_static import GTFSStatic
from .models import AlertsResponse, HealthStatus, RouteInfo, VehiclesResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger(__name__)

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "30"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

gtfs_static = GTFSStatic()
poller = FeedPoller(gtfs_static, poll_interval=POLL_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Loading GTFS static data…")
    try:
        gtfs_static.load()
    except Exception as exc:
        log.error("Failed to load GTFS static data: %s — vehicles will lack headsigns/colors", exc)

    log.info("Running initial feed fetch…")
    try:
        await poller._fetch_once()
    except Exception as exc:
        log.error("Initial feed fetch failed: %s", exc)

    log.info("Starting feed poller (interval=%ds)…", POLL_INTERVAL)
    poller.start()

    yield

    poller.stop()
    log.info("Feed poller stopped.")


app = FastAPI(title="CincyBusTrackr API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/vehicles", response_model=VehiclesResponse)
async def get_vehicles(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return VehiclesResponse(
        vehicles=poller.vehicles,
        feed_timestamp=poller.feed_timestamp,
        fetched_at=poller.fetched_at,
    )


@app.get("/api/routes", response_model=list[RouteInfo])
async def get_routes():
    return [RouteInfo(**r) for r in gtfs_static.all_routes()]


@app.get("/api/health", response_model=HealthStatus)
async def get_health():
    return poller.health


@app.get("/api/alerts", response_model=AlertsResponse)
async def get_alerts(response: Response):
    response.headers["Cache-Control"] = "no-store"
    return await poller.get_alerts()
