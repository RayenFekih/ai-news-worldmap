import { resolveCountry } from "./countryCentroids";
import type { NewsItem, RawArticle } from "./types";

export interface NewsSource {
  load(): Promise<RawArticle[]>;
}

/**
 * Reads the bundled static snapshot (public/data/news_data.jsonl, one GDELT-shaped
 * article per line). Fetched at runtime rather than bundled at build time so swapping
 * this for a live source later doesn't change how the rest of the app consumes it.
 */
export class StaticJsonlNewsSource implements NewsSource {
  private readonly url: string;

  constructor(url: string = "/data/news_data.jsonl") {
    this.url = url;
  }

  async load(): Promise<RawArticle[]> {
    const response = await fetch(this.url);
    if (!response.ok) {
      throw new Error(`Failed to load news data: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RawArticle);
  }
}

/**
 * Not implemented yet — kept here as the intended drop-in replacement for
 * StaticJsonlNewsSource once the lobby demo moves to live data. GDELT's DOC 2.0 API
 * (https://api.gdeltproject.org/api/v2/doc/doc?...&format=json&mode=artlist) returns
 * `{ articles: RawArticle[] }`, i.e. the exact same RawArticle shape consumed above —
 * so only `load()` needs to change; normalizeArticle/useNewsFeed/MapView are untouched.
 *
 * export class GdeltLiveNewsSource implements NewsSource {
 *   async load(): Promise<RawArticle[]> {
 *     const res = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?...`);
 *     const json = await res.json();
 *     return json.articles;
 *   }
 * }
 */

let nextId = 0;

export function normalizeArticle(raw: RawArticle): NewsItem {
  return {
    id: `${raw.url}-${nextId++}`,
    title: raw.title?.trim() || "(untitled)",
    url: raw.url,
    domain: raw.domain,
    language: raw.language,
    sourceCountry: raw.sourcecountry?.trim() || "Unknown",
    seenDate: parseGdeltDate(raw.seendate),
    socialImage: raw.socialimage?.trim() || null,
    geo: resolveCountry(raw.sourcecountry),
  };
}

function parseGdeltDate(seendate: string): Date | null {
  // GDELT format: 20260715T124500Z
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate ?? "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
  );
}
