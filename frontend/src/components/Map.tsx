import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { POLL_MS } from "../constants";
import type { VehiclePosition } from "../types";

const CENTER: [number, number] = [-84.512, 39.1];
const ZOOM = 11;

// ── Tile styles ──────────────────────────────────────────────────────────────

function tileStyle(dark: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          dark
            ? "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
            : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: dark
          ? "© <a href='https://carto.com/attributions'>CARTO</a> © <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
          : "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
      },
    },
    layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
  };
}

// ── Icon helpers ─────────────────────────────────────────────────────────────

function contrastColor(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return "#ffffff";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#000000" : "#ffffff";
}

function busIconSvg(color: string, textColor: string, label: string): string {
  const bg = color || "#1a6dba";
  const fg = textColor || contrastColor(bg);
  // Teardrop: tip (18,3) points in direction of travel; text counter-rotates around (18,24).
  // sweep=0 → CCW arc = bottom semicircle from (6,22) through (18,34) to (30,22).
  // Control points chosen so tangents at tip are exactly opposite (G1 continuity).
  const fontSize = label.length > 2 ? 8 : 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
    <path d="M18,3 C12,9 6,13 6,22 A12,12 0 0 0 30,22 C30,13 12,9 18,3 Z"
          fill="${bg}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
    <text x="18" y="24" text-anchor="middle" dominant-baseline="middle"
      font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="700" fill="${fg}"
      transform="rotate(0,18,24)">${label}</text>
  </svg>`;
}

// ── Popup content ────────────────────────────────────────────────────────────

function formatEta(unixTs: number): string {
  const secs = Math.round(unixTs - Date.now() / 1000);
  if (secs < 60) return "arriving";
  const mins = Math.floor(secs / 60);
  return `in ${mins} min`;
}

function popupHtml(v: VehiclePosition, dark: boolean): string {
  const color = v.route_color ?? "#1a6dba";
  const fg = v.route_text_color ?? contrastColor(color);
  const routeLabel = `${v.route_short_name ?? v.route_id}${v.trip_variant ? `-${v.trip_variant}` : ""}`;
  const speedMph = v.speed != null ? `${Math.round(v.speed * 2.237)} mph` : null;
  const bg = dark ? "#1e293b" : "#ffffff";
  const textStrong = dark ? "#e2e8f0" : "#1f2937";
  const textMuted = dark ? "#94a3b8" : "#9ca3af";
  const rows = [
    speedMph
      ? `<tr><td style="color:${textMuted};padding:2px 14px 2px 0;white-space:nowrap;font-size:0.78em">Speed</td><td style="font-weight:600;color:${textStrong};font-size:0.78em">${speedMph}</td></tr>`
      : "",
    v.next_stop_name
      ? `<tr><td style="color:${textMuted};padding:2px 14px 2px 0;white-space:nowrap;font-size:0.78em">Next stop</td><td style="font-weight:600;color:${textStrong};font-size:0.78em">${v.next_stop_name}</td></tr>`
      : "",
    v.next_stop_eta
      ? `<tr><td style="color:${textMuted};padding:2px 14px 2px 0;white-space:nowrap;font-size:0.78em">ETA</td><td style="font-weight:600;color:${textStrong};font-size:0.78em">${formatEta(v.next_stop_eta)}</td></tr>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<div style="font-family:'Inter',system-ui,-apple-system,sans-serif;min-width:215px">
    <div style="background:${color};padding:12px 40px 12px 13px">
      <div style="color:${fg};font-size:0.68em;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.8;margin-bottom:4px">Route&nbsp;${routeLabel}${v.stale ? "&ensp;·&ensp;stale" : ""}</div>
      <div style="color:${fg};font-size:0.93em;font-weight:700;line-height:1.3">${v.headsign ?? "—"}</div>
    </div>
    <div style="padding:${rows ? "10px 13px 11px" : "5px 0"};background:${bg}">
      ${rows ? `<table style="border-collapse:collapse;width:100%">${rows}</table>` : ""}
    </div>
  </div>`;
}

// ── Animation math ───────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpBearing(from: number, to: number, t: number): number {
  let d = to - from;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return from + d * t;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  vehicles: VehiclePosition[];
  visibleRouteIds: Set<string>;
  darkMode: boolean;
  isStale?: boolean;
  hoveredRouteIds?: Set<string> | null;
  altColorMap?: Record<string, string> | null;
}

type MarkerEntry = {
  marker: maplibregl.Marker;
  el: HTMLDivElement;
  textEl: SVGTextElement | null;
};

type AnimTarget = {
  fromLat: number;
  fromLon: number;
  fromBearing: number;
  toLat: number;
  toLon: number;
  toBearing: number;
  startTime: number;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function Map({ vehicles, visibleRouteIds, darkMode, isStale, hoveredRouteIds, altColorMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const markersRef = useRef<globalThis.Map<string, MarkerEntry>>(new globalThis.Map());
  const animTargetsRef = useRef<globalThis.Map<string, AnimTarget>>(new globalThis.Map());

  const popupRef = useRef<maplibregl.Popup | null>(null);
  const selectedVehicleIdRef = useRef<string | null>(null);
  // Always-current lookup used inside click handlers (avoids stale closure)
  const vehiclesMapRef = useRef<globalThis.Map<string, VehiclePosition>>(new globalThis.Map());

  // Ref so the style.load callback can read darkMode without a stale closure
  const darkModeRef = useRef(darkMode);
  darkModeRef.current = darkMode;

  // ── Map init + animation loop (runs once) ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: tileStyle(darkModeRef.current),
      center: CENTER,
      zoom: ZOOM,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const addLayers = () => {
      if (!map.getSource("routes")) {
        map.addSource("routes", { type: "geojson", data: "/routes.geojson" });
      }
      if (!map.getLayer("route-lines")) {
        map.addLayer({
          id: "route-lines",
          type: "line",
          source: "routes",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "route_color"],
            "line-width": 2.5,
            "line-opacity": 0.85,
          },
        });
      }
      if (!map.getSource("stops")) {
        map.addSource("stops", {
          type: "geojson",
          data: "/stops.geojson",
          cluster: true,
          clusterMaxZoom: 12,
          clusterRadius: 30,
        });
      }
      if (!map.getLayer("stop-clusters")) {
        map.addLayer({
          id: "stop-clusters",
          type: "circle",
          source: "stops",
          filter: ["has", "point_count"],
          paint: { "circle-color": "#555", "circle-radius": 6, "circle-opacity": 0.5 },
          minzoom: 10,
          maxzoom: 13,
        });
      }
      if (!map.getLayer("stop-dots")) {
        map.addLayer({
          id: "stop-dots",
          type: "circle",
          source: "stops",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": "#444",
            "circle-radius": 3,
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.75,
          },
          minzoom: 13,
        });
      }
    };

    // style.load fires on initial load AND after every setStyle() call
    map.on("style.load", () => {
      addLayers();
      setMapReady(true);
    });

    mapRef.current = map;

    // Persistent rAF animation loop — interpolates marker positions each frame
    let rafId: number;
    const loop = (now: number) => {
      for (const [id, target] of animTargetsRef.current) {
        const entry = markersRef.current.get(id);
        if (!entry) continue;

        const t = Math.min((now - target.startTime) / POLL_MS, 1);
        const lat = lerp(target.fromLat, target.toLat, t);
        const lon = lerp(target.fromLon, target.toLon, t);
        const bearing = lerpBearing(target.fromBearing, target.toBearing, t);

        entry.marker.setLngLat([lon, lat]);
        entry.marker.setRotation(bearing);
        entry.textEl?.setAttribute("transform", `rotate(${-bearing},18,24)`);

        // Keep popup pinned to the animated marker position
        if (id === selectedVehicleIdRef.current && popupRef.current) {
          popupRef.current.setLngLat([lon, lat]);
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      animTargetsRef.current.clear();
      setMapReady(false);
    };
  }, []);

  // ── Dark mode tile swap ────────────────────────────────────────────────────
  const darkModeInitRef = useRef(true);
  useEffect(() => {
    if (darkModeInitRef.current) {
      darkModeInitRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    setMapReady(false);
    map.setStyle(tileStyle(darkMode));
    // style.load will fire → addLayers() → setMapReady(true)
  }, [darkMode]);

  // ── Route line visibility ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (visibleRouteIds.size === 0) {
      map.setFilter("route-lines", ["==", "route_id", "__none__"]);
    } else {
      map.setFilter("route-lines", [
        "in",
        ["get", "route_id"],
        ["literal", Array.from(visibleRouteIds)],
      ]);
    }
  }, [visibleRouteIds, mapReady]);

  // ── Alt route line colors ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (altColorMap && Object.keys(altColorMap).length > 0) {
      const pairs: unknown[] = [];
      for (const [id, color] of Object.entries(altColorMap)) {
        pairs.push(id, color);
      }
      map.setPaintProperty("route-lines", "line-color", [
        "match", ["get", "route_id"], ...pairs, "#888888",
      ]);
    } else {
      map.setPaintProperty("route-lines", "line-color", ["get", "route_color"]);
    }
  }, [altColorMap, mapReady]);

  // ── Route line hover highlight ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (hoveredRouteIds && hoveredRouteIds.size > 0) {
      const ids = Array.from(hoveredRouteIds);
      map.setPaintProperty("route-lines", "line-opacity", [
        "case", ["in", ["get", "route_id"], ["literal", ids]], 1.0, 0.12,
      ]);
      map.setPaintProperty("route-lines", "line-width", [
        "case", ["in", ["get", "route_id"], ["literal", ids]], 4.5, 1.5,
      ]);
    } else {
      map.setPaintProperty("route-lines", "line-opacity", 0.85);
      map.setPaintProperty("route-lines", "line-width", 2.5);
    }
  }, [hoveredRouteIds, mapReady]);

  // ── Stale mode: dim stop dots ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer("stop-dots")) {
      map.setPaintProperty("stop-dots", "circle-opacity", isStale ? 0.2 : 0.75);
      map.setPaintProperty("stop-dots", "circle-stroke-opacity", isStale ? 0.2 : 0.75);
    }
    if (map.getLayer("stop-clusters")) {
      map.setPaintProperty("stop-clusters", "circle-opacity", isStale ? 0.15 : 0.5);
    }
  }, [isStale, mapReady]);

  // ── Marker sync + animation targets ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    vehiclesMapRef.current = new globalThis.Map(vehicles.map((v) => [v.vehicle_id, v]));

    const existing = markersRef.current;
    const currentIds = new Set(vehicles.map((v) => v.vehicle_id));

    // Remove markers for vehicles that left the feed entirely
    for (const [id, entry] of existing) {
      if (!currentIds.has(id)) {
        entry.marker.remove();
        existing.delete(id);
        animTargetsRef.current.delete(id);
        if (id === selectedVehicleIdRef.current) {
          popupRef.current?.remove();
          popupRef.current = null;
          selectedVehicleIdRef.current = null;
        }
      }
    }

    const now = performance.now();

    for (const v of vehicles) {
      const color = altColorMap?.[v.route_id] ?? v.route_color ?? "#1a6dba";
      const textColor = v.route_text_color || contrastColor(color);
      const label = `${v.route_short_name ?? v.route_id}${v.trip_variant ? `-${v.trip_variant}` : ""}`;
      const opacity = v.stale ? "0.35" : "1";
      const title = [v.route_short_name, v.headsign].filter(Boolean).join(" — ");
      const toBearing = v.bearing ?? 0;
      const isVisible = visibleRouteIds.has(v.route_id);

      if (existing.has(v.vehicle_id)) {
        const entry = existing.get(v.vehicle_id)!;

        if (!isVisible) {
          entry.marker.remove();
          existing.delete(v.vehicle_id);
          animTargetsRef.current.delete(v.vehicle_id);
          if (v.vehicle_id === selectedVehicleIdRef.current) {
            popupRef.current?.remove();
            popupRef.current = null;
            selectedVehicleIdRef.current = null;
          }
          continue;
        }

        // Update visuals (innerHTML re-renders SVG; animation loop handles position)
        entry.el.style.opacity = opacity;
        entry.el.title = title;
        entry.el.innerHTML = busIconSvg(color, textColor, label);
        entry.textEl = entry.el.querySelector("text") as SVGTextElement | null;

        // Seed counter-rotation to the marker's current animated bearing
        const currentBearing = entry.marker.getRotation();
        entry.textEl?.setAttribute("transform", `rotate(${-currentBearing},18,24)`);

        // Transition: from = current animated position, to = new feed position
        const lngLat = entry.marker.getLngLat();
        animTargetsRef.current.set(v.vehicle_id, {
          fromLat: lngLat.lat,
          fromLon: lngLat.lng,
          fromBearing: currentBearing,
          toLat: v.lat,
          toLon: v.lon,
          toBearing,
          startTime: now,
        });

        // Refresh popup content if this vehicle is currently selected
        if (v.vehicle_id === selectedVehicleIdRef.current && popupRef.current) {
          popupRef.current.setHTML(popupHtml(v, darkModeRef.current));
        }
      } else {
        if (!isVisible) continue;

        // New marker — place at final position, no animation needed
        const el = document.createElement("div");
        el.style.cssText = "width:36px;height:36px;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3));";
        el.style.opacity = opacity;
        el.title = title;
        el.innerHTML = busIconSvg(color, textColor, label);

        const textEl = el.querySelector("text") as SVGTextElement | null;
        textEl?.setAttribute("transform", `rotate(${-toBearing},18,24)`);

        const marker = new maplibregl.Marker({
          element: el,
          anchor: "center",
          rotationAlignment: "map",
        })
          .setLngLat([v.lon, v.lat])
          .setRotation(toBearing)
          .addTo(map);

        const entry: MarkerEntry = { marker, el, textEl };
        existing.set(v.vehicle_id, entry);

        // Click → open popup with latest vehicle data
        const vehicleId = v.vehicle_id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const latest = vehiclesMapRef.current.get(vehicleId);
          if (!latest) return;

          popupRef.current?.remove();
          selectedVehicleIdRef.current = vehicleId;

          const markerLngLat = markersRef.current.get(vehicleId)?.marker.getLngLat();
          popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnClick: false,
            maxWidth: "260px",
            offset: 18,
          })
            .setLngLat(markerLngLat ?? [latest.lon, latest.lat])
            .setHTML(popupHtml(latest, darkModeRef.current))
            .addTo(map);

          popupRef.current.on("close", () => {
            selectedVehicleIdRef.current = null;
            popupRef.current = null;
          });
        });

        // No positional animation for brand-new markers (from = to)
        animTargetsRef.current.set(vehicleId, {
          fromLat: v.lat,
          fromLon: v.lon,
          fromBearing: toBearing,
          toLat: v.lat,
          toLon: v.lon,
          toBearing,
          startTime: now,
        });
      }
    }
  }, [vehicles, visibleRouteIds, mapReady, altColorMap]);

  const mapBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: "10px",
    zIndex: 10,
    width: "29px",
    height: "29px",
    background: "#fff",
    border: "none",
    borderRadius: "4px",
    boxShadow: "0 0 0 2px rgba(0,0,0,0.1)",
    cursor: "pointer",
    fontSize: "15px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0 }}
        aria-label="Cincinnati Metro bus map"
      />
      <button
        style={{ ...mapBtnStyle, top: "188px" }}
        onClick={() => mapRef.current?.flyTo({ center: CENTER, zoom: ZOOM })}
        title="Re-center map"
        aria-label="Re-center map"
      >
        ⌖
      </button>
    </>
  );
}
