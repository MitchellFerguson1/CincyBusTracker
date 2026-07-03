import { useEffect, useMemo, useRef, useState } from "react";
import AlertsBar from "./components/AlertsBar";
import Map from "./components/Map";
import RouteSelector from "./components/RouteSelector";
import StatusBar from "./components/StatusBar";
import { useRoutes } from "./hooks/useRoutes";
import { useVehicles } from "./hooks/useVehicles";
import type { DirectionFilter } from "./types";

const ALT_CATEGORY_COLORS: Record<string, string> = {
  Core: "#df6b2a",
  Major: "#426caa",
  Minor: "#6cc4e8",
  Commuter: "#f78d2b",
  Express: "#d6c727",
  Crosstown: "#df6b2a",
};

// Read URL params once on mount (before any state is set)
function readUrlParams(): { routes: string[] | null; dir: string | null } {
  const p = new URLSearchParams(window.location.search);
  return {
    routes: p.get("routes")?.split(",").filter(Boolean) ?? null,
    dir: p.get("dir"),
  };
}

export default function App() {
  const { routes, error: routesError } = useRoutes();
  const { data, health, error, lastUpdated } = useVehicles();

  const allIds = useMemo(() => new Set(routes.map((r) => r.route_id)), [routes]);

  const [initialUrlParams] = useState(readUrlParams);

  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());

  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>(() => {
    const { dir } = initialUrlParams;
    if (dir === "inbound") return "Inbound";
    if (dir === "outbound") return "Outbound";
    return "All";
  });

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("darkMode") === "true"
  );

  const [altColors, setAltColors] = useState(false);

  const altColorMap = useMemo<Record<string, string> | null>(() => {
    if (!altColors || routes.length === 0) return null;
    return Object.fromEntries(
      routes.flatMap((r) =>
        r.category && ALT_CATEGORY_COLORS[r.category] ? [[r.route_id, ALT_CATEGORY_COLORS[r.category]]] : []
      )
    );
  }, [altColors, routes]);

  const [hoveredCategoryRouteIds, setHoveredCategoryRouteIds] = useState<Set<string> | null>(null);

  // Persist dark mode preference
  useEffect(() => {
    localStorage.setItem("darkMode", darkMode ? "true" : "false");
    document.body.style.background = darkMode ? "#1a1a2e" : "";
  }, [darkMode]);

  // Apply URL route selection once after routes load; fall back to all
  const routesInitialized = useRef(false);
  useEffect(() => {
    if (routes.length === 0 || routesInitialized.current) return;
    routesInitialized.current = true;

    if (initialUrlParams.routes) {
      const validIds = new Set(routes.map((r) => r.route_id));
      const fromUrl = new Set(initialUrlParams.routes.filter((id) => validIds.has(id)));
      setSelectedRouteIds(fromUrl.size > 0 ? fromUrl : allIds);
    } else {
      setSelectedRouteIds(allIds);
    }
  }, [routes.length, allIds, initialUrlParams.routes]);

  // Sync URL whenever selection or direction changes (after init)
  useEffect(() => {
    if (!routesInitialized.current) return;
    const params = new URLSearchParams();
    if (selectedRouteIds.size > 0 && selectedRouteIds.size < routes.length) {
      params.set("routes", Array.from(selectedRouteIds).sort().join(","));
    }
    if (directionFilter !== "All") {
      params.set("dir", directionFilter.toLowerCase());
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [selectedRouteIds, directionFilter, routes.length]);

  const isDown = health?.status === "down" || !!error;

  const visibleVehicles = useMemo(() => {
    if (!data) return [];
    return data.vehicles.filter((v) => {
      if (!selectedRouteIds.has(v.route_id)) return false;
      if (directionFilter === "Inbound") return v.inbound === true;
      if (directionFilter === "Outbound") return v.inbound === false || v.inbound === null;
      return true;
    });
  }, [data, selectedRouteIds, directionFilter]);

  const displayVehicles = useMemo(
    () => (isDown ? visibleVehicles.map((v) => ({ ...v, stale: true })) : visibleVehicles),
    [visibleVehicles, isDown]
  );

  return (
    <div style={{ position: "relative", width: "100vw", height: "100dvh" }}>
      <Map
        vehicles={displayVehicles}
        visibleRouteIds={selectedRouteIds}
        darkMode={darkMode}
        isStale={isDown}
        hoveredRouteIds={hoveredCategoryRouteIds}
        altColorMap={altColorMap}
      />
      <RouteSelector
        routes={routes}
        routesError={routesError}
        selectedRouteIds={selectedRouteIds}
        onSelectionChange={setSelectedRouteIds}
        directionFilter={directionFilter}
        onDirectionChange={setDirectionFilter}
        onCategoryHover={setHoveredCategoryRouteIds}
      />
      <button
        style={{
          position: "absolute",
          top: "110px",
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
        }}
        onClick={() => setDarkMode((d) => !d)}
        title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        {darkMode ? "☀" : "☾"}
      </button>
      <button
        style={{
          position: "absolute",
          top: "149px",
          right: "10px",
          zIndex: 10,
          width: "29px",
          height: "29px",
          background: altColors ? "#19468d" : "#fff",
          border: "none",
          borderRadius: "4px",
          boxShadow: "0 0 0 2px rgba(0,0,0,0.1)",
          cursor: "pointer",
          fontSize: "9px",
          fontWeight: 700,
          color: altColors ? "#fff" : "#444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          letterSpacing: "-0.02em",
        }}
        onClick={() => setAltColors((a) => !a)}
        title={altColors ? "Revert to GTFS route colors" : "Try alt category colors"}
        aria-label="Toggle alt route colors"
        aria-pressed={altColors}
      >
        ALT
      </button>
      <AlertsBar />
      <StatusBar
        health={health}
        lastUpdated={lastUpdated}
        vehicleCount={visibleVehicles.length}
        error={error}
      />
    </div>
  );
}
