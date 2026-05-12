import { useEffect, useState } from "react";
import type { Alert } from "../types";
import styles from "./AlertsBar.module.css";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const POLL_MS = 60_000;

function effectLabel(effect: string): string {
  return effect
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AlertsBar() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchAlerts = () => {
      window
        .fetch(`${API_URL}/api/alerts`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.alerts) setAlerts(data.alerts);
        })
        .catch(() => {});
    };

    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className={styles.container}>
      <button
        className={styles.toggle}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className={styles.icon}>⚠</span>
        {alerts.length} service alert{alerts.length !== 1 ? "s" : ""}
        <span className={styles.chevron}>{expanded ? "▴" : "▾"}</span>
      </button>

      {expanded && (
        <div className={styles.list}>
          {alerts.map((a) => (
            <div key={a.id} className={styles.alert}>
              <div className={styles.alertHeader}>{a.header}</div>
              {a.description && a.description !== a.header && (
                <div className={styles.alertDesc}>{a.description}</div>
              )}
              {a.effect &&
                a.effect !== "UNKNOWN_EFFECT" &&
                a.effect !== "OTHER_EFFECT" &&
                a.effect !== "NO_EFFECT" && (
                  <div className={styles.alertEffect}>{effectLabel(a.effect)}</div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
