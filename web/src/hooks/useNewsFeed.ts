import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeArticle, StaticJsonlNewsSource } from "../data/newsSource";
import type { NewsItem } from "../data/types";

const MIN_INTERVAL_MS = 4500;
const MAX_INTERVAL_MS = 7000;
const HISTORY_LIMIT = 8;

export interface FeedStats {
  totalRevealed: number;
  uniqueCountries: number;
  topLanguage: string | null;
  loopsCompleted: number;
  elapsedMs: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
  iso2: string;
  count: number;
}

export interface NewsFeedState {
  loading: boolean;
  error: string | null;
  allItems: NewsItem[];
  current: NewsItem | null;
  history: NewsItem[];
  points: MapPoint[];
  stats: FeedStats;
}

function nextIntervalMs(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
}

export function useNewsFeed(): NewsFeedState {
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<NewsItem[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loopsCompleted, setLoopsCompleted] = useState(0);
  const [startTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const cursor = useRef(0);
  const countriesSeen = useRef(new Set<string>());
  const languageCounts = useRef(new Map<string, number>());
  const pointsByIso2 = useRef(new Map<string, MapPoint>());
  const totalRevealed = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const source = new StaticJsonlNewsSource();
    source
      .load()
      .then((raw) => {
        if (cancelled) return;
        const items = raw.map(normalizeArticle);
        setAllItems(items);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (allItems.length === 0) return;

    let timeoutId: number;

    const reveal = () => {
      const item = allItems[cursor.current];

      totalRevealed.current += 1;
      if (item.geo) {
        countriesSeen.current.add(item.geo.iso2);
        const existing = pointsByIso2.current.get(item.geo.iso2);
        pointsByIso2.current.set(item.geo.iso2, {
          lat: item.geo.lat,
          lng: item.geo.lng,
          iso2: item.geo.iso2,
          count: (existing?.count ?? 0) + 1,
        });
        setPoints(Array.from(pointsByIso2.current.values()));
      }
      languageCounts.current.set(item.language, (languageCounts.current.get(item.language) ?? 0) + 1);

      setHistory((prevHistory) => [item, ...prevHistory].slice(0, HISTORY_LIMIT));

      cursor.current += 1;
      if (cursor.current >= allItems.length) {
        cursor.current = 0;
        setLoopsCompleted((n) => n + 1);
      }

      timeoutId = window.setTimeout(reveal, nextIntervalMs());
    };

    // Reveal the first story immediately, then keep cycling.
    reveal();

    return () => window.clearTimeout(timeoutId);
  }, [allItems]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const current = history[0] ?? null;

  const stats: FeedStats = useMemo(() => {
    let topLanguage: string | null = null;
    let topCount = 0;
    for (const [lang, count] of languageCounts.current) {
      if (count > topCount) {
        topLanguage = lang;
        topCount = count;
      }
    }
    return {
      totalRevealed: totalRevealed.current,
      uniqueCountries: countriesSeen.current.size,
      topLanguage,
      loopsCompleted,
      elapsedMs: now - startTime,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, loopsCompleted, now, startTime]);

  return { loading, error, allItems, current, history, points, stats };
}
