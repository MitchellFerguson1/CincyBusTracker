import { useEffect, useState } from "react";
import type { HealthStatus } from "../types";
import styles from "./StatusBar.module.css";

interface Props {
  health: HealthStatus | null;
  lastUpdated: Date | null;
  vehicleCount: number;
  error: string | null;
}

function timeAgo(date: Date, now: Date): string {
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export default function StatusBar({
  health,
  lastUpdated,
  vehicleCount,
  error,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isDown = health?.status === "down" || !!error;
  const isDegraded = health?.status === "degraded";

  return (
    <>
      <div
        className={`${styles.bar} ${
          isDown ? styles.barDown : isDegraded ? styles.barDegraded : styles.barOk
        }`}
      >
        <span className={styles.dot} />
        {isDown ? (
          <span>
            Live data unavailable — showing last known positions
            {health?.feed_age_seconds
              ? ` from ${Math.round(health.feed_age_seconds / 60)}m ago`
              : ""}
          </span>
        ) : (
          <span>
            {vehicleCount} buses active
            {lastUpdated ? ` · Updated ${timeAgo(lastUpdated, now)}` : ""}
          </span>
        )}
        <span className={styles.disclaimer}>
          Not affiliated with SORTA&nbsp;/&nbsp;Cincinnati Metro
        </span>
      </div>

      {isDown && (
        <div className={styles.staleBanner}>
          Live data unavailable — feed failure #{health?.consecutive_failures ?? "?"}. All
          buses shown at 30% opacity.
        </div>
      )}
    </>
  );
}
