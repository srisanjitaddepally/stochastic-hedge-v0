/** Per-event keys (v2). Legacy global key `stochastic-hedge-grid-defaults-v1` is ignored. */
const STORAGE_KEY_PREFIX = "stochastic-hedge-grid-defaults-v2-event-";

export type GridDefaultsPersisted = {
  oddMin: number;
  oddMax: number;
  oddStep: number;
  stakeMin: number;
  stakeMax: number;
  stakeStep: number;
  showAmerican: boolean;
  filterNonNegative: boolean;
};

export const GRID_DEFAULTS_INITIAL: GridDefaultsPersisted = {
  oddMin: 1.85,
  oddMax: 2.6,
  oddStep: 0.05,
  stakeMin: 25,
  stakeMax: 350,
  stakeStep: 25,
  showAmerican: false,
  filterNonNegative: false
};

function storageKey(eventId: number): string {
  return `${STORAGE_KEY_PREFIX}${eventId}`;
}

export function loadGridDefaults(eventId: number): GridDefaultsPersisted {
  if (typeof window === "undefined") return { ...GRID_DEFAULTS_INITIAL };
  try {
    const raw = localStorage.getItem(storageKey(eventId));
    if (!raw) return { ...GRID_DEFAULTS_INITIAL };
    const p = JSON.parse(raw) as Partial<GridDefaultsPersisted>;
    const d = GRID_DEFAULTS_INITIAL;
    return {
      oddMin: typeof p.oddMin === "number" ? p.oddMin : d.oddMin,
      oddMax: typeof p.oddMax === "number" ? p.oddMax : d.oddMax,
      oddStep: typeof p.oddStep === "number" ? p.oddStep : d.oddStep,
      stakeMin: typeof p.stakeMin === "number" ? p.stakeMin : d.stakeMin,
      stakeMax: typeof p.stakeMax === "number" ? p.stakeMax : d.stakeMax,
      stakeStep: typeof p.stakeStep === "number" ? p.stakeStep : d.stakeStep,
      showAmerican: typeof p.showAmerican === "boolean" ? p.showAmerican : d.showAmerican,
      filterNonNegative: typeof p.filterNonNegative === "boolean" ? p.filterNonNegative : d.filterNonNegative
    };
  } catch {
    return { ...GRID_DEFAULTS_INITIAL };
  }
}

export function saveGridDefaults(eventId: number, values: GridDefaultsPersisted): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(values));
  } catch {
    /* ignore quota */
  }
}
