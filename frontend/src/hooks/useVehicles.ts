import { useCallback, useEffect, useRef, useState } from "react";
import type { HealthStatus, VehiclesResponse } from "../types";
import { POLL_MS } from "../constants";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useVehicles() {
  const [data, setData] = useState<VehiclesResponse | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchVehicles = useCallback(async () => {
    try {
      const [vResp, hResp] = await Promise.all([
        fetch(`${API_URL}/api/vehicles`),
        fetch(`${API_URL}/api/health`),
      ]);
      if (!vResp.ok) throw new Error(`HTTP ${vResp.status}`);
      const [vehicles, healthData] = await Promise.all([
        vResp.json() as Promise<VehiclesResponse>,
        hResp.ok ? (hResp.json() as Promise<HealthStatus>) : Promise.resolve(null),
      ]);
      setData(vehicles);
      if (healthData) setHealth(healthData);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    timerRef.current = setInterval(fetchVehicles, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchVehicles]);

  return { data, health, error, lastUpdated };
}
