import type { Topic } from "./types";

const STORAGE_KEY = "ai-news-worldmap:topic-snapshots";
const MAX_ENTRIES = 2;

export interface TopicSnapshot {
  date: string; // "YYYY-MM-DD", local date
  topicCounts: Partial<Record<Topic, number>>;
  totalAiStories: number;
}

/** Local (not UTC) date key, so it matches what the Header's visible clock shows. */
function localDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readLog(): TopicSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Records today's topic counts, overwriting any existing entry for today (so re-running the
 * data pipeline multiple times in one day doesn't create duplicate "days"). Caller is
 * responsible for invoking this from an effect, not from a render/memo body.
 */
export function recordTodaySnapshot(topicCounts: Partial<Record<Topic, number>>, totalAiStories: number): void {
  const today = localDateKey(new Date());
  const log = readLog().filter((entry) => entry.date !== today);
  log.push({ date: today, topicCounts, totalAiStories });
  log.sort((a, b) => a.date.localeCompare(b.date));
  const trimmed = log.slice(-MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) - topic evolution just stays empty.
  }
}

/**
 * Returns the most recent snapshot strictly before today, or null if none exists yet.
 * Note: if the underlying data file isn't actually refreshed between calendar days, this will
 * report a "yesterday" identical to today (flat deltas) rather than a real day-over-day change -
 * an accepted limitation given the data pipeline's refresh cadence is entirely manual.
 */
export function getYesterdaySnapshot(): TopicSnapshot | null {
  const today = localDateKey(new Date());
  const prior = readLog()
    .filter((entry) => entry.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));
  return prior[0] ?? null;
}
