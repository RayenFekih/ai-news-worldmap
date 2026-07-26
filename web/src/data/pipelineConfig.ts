import { REVEAL_MAX_INTERVAL_MS, REVEAL_MIN_INTERVAL_MS } from "./config";

export interface RevealTiming {
  revealMinIntervalMs: number;
  revealMaxIntervalMs: number;
}

const DEFAULT_TIMING: RevealTiming = {
  revealMinIntervalMs: REVEAL_MIN_INTERVAL_MS,
  revealMaxIntervalMs: REVEAL_MAX_INTERVAL_MS,
};

/**
 * Backend-controlled reveal cadence (`src/settings.py` REVEAL_MIN/MAX_INTERVAL_SECONDS), exported
 * as a small JSON sidecar alongside the enriched snapshot (`pipeline.run_config_export_stage`).
 * Falls back to the frontend's own defaults if the file is missing (e.g. the pipeline hasn't run
 * yet with this feature) or unparseable — a soft override, not a hard dependency.
 */
export async function loadRevealTiming(url = "/data/pipeline_config.json"): Promise<RevealTiming> {
  try {
    const response = await fetch(url);
    if (!response.ok) return DEFAULT_TIMING;
    const json = await response.json();
    const min = Number(json.reveal_min_interval_ms);
    const max = Number(json.reveal_max_interval_ms);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return DEFAULT_TIMING;
    return { revealMinIntervalMs: min, revealMaxIntervalMs: max };
  } catch {
    return DEFAULT_TIMING;
  }
}
