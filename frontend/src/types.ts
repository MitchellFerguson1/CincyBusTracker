export interface VehiclePosition {
  vehicle_id: string;
  route_id: string;
  trip_id: string;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  direction_id: number | null;
  inbound: boolean | null;
  timestamp: number | null;
  stale: boolean;
  headsign: string | null;
  route_short_name: string | null;
  route_color: string | null;
  route_text_color: string | null;
  next_stop_name: string | null;
  next_stop_eta: number | null;  // Unix timestamp
  trip_variant: string | null;
}

export interface RouteInfo {
  route_id: string;
  route_short_name: string;
  route_long_name: string;
  route_color: string;
  route_text_color: string;
  category: string | null;
}

export interface VehiclesResponse {
  vehicles: VehiclePosition[];
  feed_timestamp: number | null;
  fetched_at: number | null;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  last_fetch_time: number | null;
  consecutive_failures: number;
  vehicle_count: number;
  feed_age_seconds: number | null;
}

export interface Alert {
  id: string;
  header: string;
  description: string | null;
  effect: string | null;
  route_ids: string[];
}

export interface AlertsResponse {
  alerts: Alert[];
  fetched_at: number | null;
}

export type RouteCategory = "All" | "Core" | "Major" | "Minor" | "Commuter" | "Express";
export type DirectionFilter = "All" | "Inbound" | "Outbound";
