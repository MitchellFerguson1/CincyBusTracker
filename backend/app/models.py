from typing import Optional
from pydantic import BaseModel


class VehiclePosition(BaseModel):
    vehicle_id: str
    route_id: str
    trip_id: str
    lat: float
    lon: float
    bearing: Optional[float] = None
    speed: Optional[float] = None
    direction_id: Optional[int] = None
    inbound: Optional[bool] = None
    timestamp: Optional[int] = None
    stale: bool = False
    headsign: Optional[str] = None
    route_short_name: Optional[str] = None
    route_color: Optional[str] = None
    route_text_color: Optional[str] = None
    next_stop_name: Optional[str] = None
    next_stop_eta: Optional[int] = None  # Unix timestamp
    trip_variant: Optional[str] = None


class RouteInfo(BaseModel):
    route_id: str
    route_short_name: str
    route_long_name: str
    route_color: str
    route_text_color: str
    category: Optional[str] = None


class HealthStatus(BaseModel):
    status: str  # "ok" | "degraded" | "down"
    last_fetch_time: Optional[float] = None
    consecutive_failures: int = 0
    vehicle_count: int = 0
    feed_age_seconds: Optional[float] = None


class VehiclesResponse(BaseModel):
    vehicles: list[VehiclePosition]
    feed_timestamp: Optional[int] = None
    fetched_at: Optional[float] = None


class Alert(BaseModel):
    id: str
    header: str
    description: Optional[str] = None
    effect: Optional[str] = None
    route_ids: list[str] = []


class AlertsResponse(BaseModel):
    alerts: list[Alert] = []
    fetched_at: Optional[float] = None
