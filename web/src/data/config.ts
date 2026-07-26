/** Randomized reveal cadence for the ticker/story panels — how often the next queued item appears. */
export const REVEAL_MIN_INTERVAL_MS = Number(import.meta.env.VITE_REVEAL_MIN_INTERVAL_MS) || 9000;
export const REVEAL_MAX_INTERVAL_MS = Number(import.meta.env.VITE_REVEAL_MAX_INTERVAL_MS) || 14000;

/** How often the running app re-fetches the static snapshot to pick up newly-exported articles. */
export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 60000;

export const HISTORY_LIMIT = 8;
