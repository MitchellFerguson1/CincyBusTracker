import { useState } from "react";
import type { DirectionFilter, RouteCategory, RouteInfo } from "../types";
import styles from "./RouteSelector.module.css";

const BUS_ICON = (
  <svg width="14" height="14" viewBox="0 0 36 36" fill="currentColor" aria-hidden>
    <path d="M18,3 C12,9 6,13 6,22 A12,12 0 0 0 30,22 C30,13 12,9 18,3 Z" />
  </svg>
);

const CATEGORIES: RouteCategory[] = ["Core", "Major", "Minor", "Commuter", "Express"];
const DIRECTIONS: DirectionFilter[] = ["All", "Inbound", "Outbound"];

interface Props {
  routes: RouteInfo[];
  routesError?: string | null;
  selectedRouteIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  directionFilter: DirectionFilter;
  onDirectionChange: (dir: DirectionFilter) => void;
  onCategoryHover?: (ids: Set<string> | null) => void;
}

export default function RouteSelector({
  routes,
  routesError,
  selectedRouteIds,
  onSelectionChange,
  directionFilter,
  onDirectionChange,
  onCategoryHover,
}: Props) {
  const [openCategory, setOpenCategory] = useState<RouteCategory | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const allSelected = selectedRouteIds.size === routes.length && routes.length > 0;

  const allIds = new Set(routes.map((r) => r.route_id));

  const routesByCategory = (cat: RouteCategory) =>
    routes.filter((r) => r.category === cat);

  function toggleAll() {
    onSelectionChange(allSelected ? new Set() : allIds);
  }

  function toggleCategory(cat: RouteCategory) {
    const catIds = routesByCategory(cat).map((r) => r.route_id);
    const allCatSelected = catIds.every((id) => selectedRouteIds.has(id));
    const next = new Set(selectedRouteIds);
    if (allCatSelected) {
      catIds.forEach((id) => next.delete(id));
    } else {
      catIds.forEach((id) => next.add(id));
    }
    onSelectionChange(next);
  }

  function toggleRoute(routeId: string) {
    const next = new Set(selectedRouteIds);
    if (next.has(routeId)) {
      next.delete(routeId);
    } else {
      next.add(routeId);
    }
    onSelectionChange(next);
  }

  function categoryState(cat: RouteCategory): "all" | "some" | "none" {
    const catIds = routesByCategory(cat).map((r) => r.route_id);
    const count = catIds.filter((id) => selectedRouteIds.has(id)).length;
    if (count === 0) return "none";
    if (count === catIds.length) return "all";
    return "some";
  }

  const loading = routes.length === 0;

  return (
    <>
    {/* Mobile FAB */}
    <button
      className={styles.fab}
      onClick={() => setSheetOpen(o => !o)}
      aria-label={sheetOpen ? "Close route selector" : "Open route selector"}
    >
      {sheetOpen ? "✕" : <>{BUS_ICON} Routes</>}
    </button>

    {sheetOpen && (
      <div className={styles.backdrop} onClick={() => setSheetOpen(false)} />
    )}

    {/* Desktop reopen button — only visible when collapsed */}
    <button
      className={`${styles.reopenBtn} ${collapsed ? styles.reopenVisible : ""}`}
      onClick={() => setCollapsed(false)}
      aria-label="Show route selector"
      title="Show routes"
    >
      {BUS_ICON}
    </button>

    <div className={`${styles.panel} ${sheetOpen ? styles.panelOpen : ""} ${collapsed ? styles.panelCollapsed : ""}`}>
      <div className={styles.sheetHandle} aria-hidden />
      <div className={styles.brand} aria-hidden>
        {BUS_ICON}
        <span>CincyBusTrackr</span>
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(true)}
          title="Hide panel"
          aria-label="Hide panel"
        >
          ‹
        </button>
      </div>
      <div className={styles.header}>
        <span className={styles.title}>Routes</span>
        <button
          className={`${styles.allBtn} ${allSelected ? styles.active : ""}`}
          onClick={toggleAll}
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div className={styles.directionRow}>
        {DIRECTIONS.map((dir) => (
          <button
            key={dir}
            className={`${styles.dirBtn} ${directionFilter === dir ? styles.dirActive : ""}`}
            onClick={() => onDirectionChange(dir)}
          >
            {dir}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.skeleton}>
          {CATEGORIES.map((cat) => (
            <div key={cat} className={styles.skeletonRow} />
          ))}
        </div>
      ) : routesError ? (
        <p style={{ padding: "12px 16px", margin: 0, color: "#ef4444", fontSize: "0.82em" }}>
          Could not load routes: {routesError}
        </p>
      ) : (
        <div className={styles.categories}>
          {CATEGORIES.map((cat) => {
            const catRoutes = routesByCategory(cat);
            if (catRoutes.length === 0) return null;
            const state = categoryState(cat);
            const isOpen = openCategory === cat;
            const catIds = catRoutes.map((r) => r.route_id);
            const selectedCount = catIds.filter((id) => selectedRouteIds.has(id)).length;
            const dotColor = catRoutes[0]?.route_color;

            return (
              <div
                key={cat}
                className={styles.categoryGroup}
                onMouseEnter={() => onCategoryHover?.(new Set(catIds))}
                onMouseLeave={() => onCategoryHover?.(null)}
              >
                <div className={styles.categoryRow}>
                  <button
                    className={`${styles.categoryBtn} ${state === "all" ? styles.active : state === "some" ? styles.partial : ""}`}
                    onClick={() => toggleCategory(cat)}
                    title={`Toggle all ${cat} routes`}
                  >
                    <span
                      className={styles.catDot}
                      style={dotColor ? { background: dotColor, opacity: state === "none" ? 0.3 : 1 } : undefined}
                    />
                    {cat}
                    <span className={styles.count}>
                      {selectedCount > 0 && selectedCount < catRoutes.length ? (
                        <><span className={styles.countActive}>{selectedCount}</span>{"/"}{catRoutes.length}</>
                      ) : (
                        catRoutes.length
                      )}
                    </span>
                  </button>
                  <button
                    className={`${styles.expandBtn} ${isOpen ? styles.open : ""}`}
                    onClick={() => setOpenCategory(isOpen ? null : cat)}
                    aria-label={isOpen ? `Collapse ${cat}` : `Expand ${cat}`}
                  >
                    ▾
                  </button>
                </div>

                {isOpen && (
                  <div className={styles.routeList}>
                    {catRoutes.map((r) => (
                      <label key={r.route_id} className={styles.routeRow}>
                        <input
                          type="checkbox"
                          checked={selectedRouteIds.has(r.route_id)}
                          onChange={() => toggleRoute(r.route_id)}
                        />
                        <span
                          className={styles.routeSwatch}
                          style={{ background: r.route_color, color: r.route_text_color }}
                        >
                          {r.route_short_name}
                        </span>
                        <span className={styles.routeName}>{r.route_long_name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
    </>
  );
}
