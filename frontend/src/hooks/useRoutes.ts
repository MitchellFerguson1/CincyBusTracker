import { useEffect, useState } from "react";
import type { RouteInfo } from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export function useRoutes() {
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/routes`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: RouteInfo[]) => {
        setRoutes(data);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load routes");
        setLoading(false);
      });
  }, []);

  return { routes, loading, error };
}
