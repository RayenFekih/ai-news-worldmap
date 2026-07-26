import { useEffect, useMemo, useRef, useState } from "react";
import { HISTORY_LIMIT, POLL_INTERVAL_MS } from "../data/config";
import { isLocalToday } from "../data/dateUtils";
import { normalizeArticle, pickNewArticles, StaticJsonlNewsSource } from "../data/newsSource";
import { loadRevealTiming, type RevealTiming } from "../data/pipelineConfig";
import { getYesterdaySnapshot, recordTodaySnapshot } from "../data/topicSnapshotStore";
import type { EntityType, NewsItem, RelevanceLevel, Topic } from "../data/types";

const TOP_ENTITY_TYPE_LIMIT = 5;
const RECENT_HEADLINES_LIMIT = 3;

const RELEVANCE_RANK: Record<RelevanceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

export interface FeedStats {
  totalRevealed: number;
  loopsCompleted: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
  iso2: string;
  count: number;
  dominantTopic: Topic | null;
  topRelevanceTier: RelevanceLevel;
}

export interface EntityFrequency {
  name: string;
  type: EntityType;
  count: number;
}

export interface RecentHeadline {
  id: string;
  title: string;
  fetchedAt: Date;
  topic: Topic | null;
}

export type TopicDirection = "up" | "down" | "flat" | "new";

export interface TopicEvolutionEntry {
  topic: Topic;
  today: number;
  yesterday: number;
  deltaPct: number | null;
  direction: TopicDirection;
}

export interface TopicEvolution {
  hasComparison: boolean;
  entries: TopicEvolutionEntry[];
}

export interface CorpusInsights {
  totalAiStories: number;
  nonAiFilteredCount: number;
  avgConfidence: number;
  bilingualCoveragePct: number;
  topicCounts: Partial<Record<Topic, number>>;
  menaRelevanceCounts: Record<RelevanceLevel, number>;
  menaHighMediumCount: number;
  menaHighMediumPct: number;
  ihorizonsRelevanceCounts: Record<RelevanceLevel, number>;
  ihorizonsHighCount: number;
  ihorizonsHighPct: number;
  countryCount: number;
  publisherCount: number;
  languageCount: number;
  aiCompanyCount: number;
  topOrganizations: EntityFrequency[];
  topModels: EntityFrequency[];
  topTechnologies: EntityFrequency[];
  recentHeadlines: RecentHeadline[];
  topicEvolution: TopicEvolution;
}

function emptyRelevanceCounts(): Record<RelevanceLevel, number> {
  return { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
}

export interface NewsFeedState {
  loading: boolean;
  error: string | null;
  allItems: NewsItem[];
  current: NewsItem | null;
  history: NewsItem[];
  points: MapPoint[];
  stats: FeedStats;
  corpusInsights: CorpusInsights;
}

function randomInterval(timing: RevealTiming): number {
  const { revealMinIntervalMs: min, revealMaxIntervalMs: max } = timing;
  return min + Math.random() * (max - min);
}

/**
 * Prefers today-local items (sorted oldest-first) so a healthy pipeline only replays fresh news,
 * but falls back to the full set rather than ever returning empty — otherwise, once every loaded
 * item ages out of "today" (e.g. GDELT hasn't produced anything new in a while), playback would
 * freeze indefinitely instead of continuing to loop through what's already loaded.
 */
function selectPlaybackQueue(items: NewsItem[]): NewsItem[] {
  const sorted = [...items].sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());
  const today = sorted.filter((item) => isLocalToday(item.fetchedAt));
  return today.length > 0 ? today : sorted;
}

function topEntitiesOfType(entityCounts: Map<string, EntityFrequency>, type: EntityType): EntityFrequency[] {
  return Array.from(entityCounts.values())
    .filter((e) => e.type === type)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_ENTITY_TYPE_LIMIT);
}

function computeTopicEvolution(topicCounts: Partial<Record<Topic, number>>): TopicEvolution {
  const yesterday = getYesterdaySnapshot();
  if (!yesterday) {
    return { hasComparison: false, entries: [] };
  }

  const topics = new Set<Topic>([
    ...(Object.keys(topicCounts) as Topic[]),
    ...(Object.keys(yesterday.topicCounts) as Topic[]),
  ]);

  const entries: TopicEvolutionEntry[] = Array.from(topics).map((topic) => {
    const today = topicCounts[topic] ?? 0;
    const prior = yesterday.topicCounts[topic] ?? 0;
    let direction: TopicDirection;
    let deltaPct: number | null;
    if (prior === 0) {
      direction = today > 0 ? "new" : "flat";
      deltaPct = null;
    } else {
      deltaPct = Math.round(((today - prior) / prior) * 100);
      direction = today > prior ? "up" : today < prior ? "down" : "flat";
    }
    return { topic, today, yesterday: prior, deltaPct, direction };
  });

  entries.sort((a, b) => b.today - a.today);
  return { hasComparison: true, entries: entries.slice(0, 4) };
}

function computeCorpusInsights(allItems: NewsItem[]): CorpusInsights {
  const aiItems = allItems.filter((item) => item.isAiRelated);
  const totalAiStories = aiItems.length;

  const topicCounts: Partial<Record<Topic, number>> = {};
  const menaRelevanceCounts = emptyRelevanceCounts();
  const ihorizonsRelevanceCounts = emptyRelevanceCounts();
  let menaHighMediumCount = 0;
  let ihorizonsHighCount = 0;
  let bilingualCount = 0;
  let confidenceSum = 0;
  const entityCounts = new Map<string, EntityFrequency>();
  const countries = new Set<string>();
  const publishers = new Set<string>();
  const languages = new Set<string>();

  for (const item of aiItems) {
    confidenceSum += item.aiRelevanceConfidence;
    if (item.topic) {
      topicCounts[item.topic] = (topicCounts[item.topic] ?? 0) + 1;
    }
    if (item.menaRelevance) {
      menaRelevanceCounts[item.menaRelevance] += 1;
    }
    if (item.ihorizonsRelevance) {
      ihorizonsRelevanceCounts[item.ihorizonsRelevance] += 1;
    }
    if (item.menaRelevance === "HIGH" || item.menaRelevance === "MEDIUM") {
      menaHighMediumCount += 1;
    }
    if (item.ihorizonsRelevance === "HIGH") {
      ihorizonsHighCount += 1;
    }
    if (item.summaryAr && item.narrationAr) {
      bilingualCount += 1;
    }
    if (item.geo) countries.add(item.geo.iso2);
    publishers.add(item.domain);
    languages.add(item.language);
    for (const entity of item.entities) {
      const existing = entityCounts.get(entity.name);
      if (existing) {
        existing.count += 1;
      } else {
        entityCounts.set(entity.name, { name: entity.name, type: entity.type, count: 1 });
      }
    }
  }

  const recentHeadlines: RecentHeadline[] = [...aiItems]
    .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime())
    .slice(0, RECENT_HEADLINES_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.narrationEn ?? item.title,
      fetchedAt: item.fetchedAt,
      topic: item.topic,
    }));

  return {
    totalAiStories,
    nonAiFilteredCount: allItems.length - totalAiStories,
    avgConfidence: totalAiStories > 0 ? Math.round((confidenceSum / totalAiStories) * 100) : 0,
    bilingualCoveragePct: totalAiStories > 0 ? Math.round((bilingualCount / totalAiStories) * 100) : 0,
    topicCounts,
    menaRelevanceCounts,
    menaHighMediumCount,
    menaHighMediumPct: totalAiStories > 0 ? Math.round((menaHighMediumCount / totalAiStories) * 100) : 0,
    ihorizonsRelevanceCounts,
    ihorizonsHighCount,
    ihorizonsHighPct: totalAiStories > 0 ? Math.round((ihorizonsHighCount / totalAiStories) * 100) : 0,
    countryCount: countries.size,
    publisherCount: publishers.size,
    languageCount: languages.size,
    aiCompanyCount: Array.from(entityCounts.values()).filter((e) => e.type === "ORGANIZATION").length,
    topOrganizations: topEntitiesOfType(entityCounts, "ORGANIZATION"),
    topModels: topEntitiesOfType(entityCounts, "MODEL"),
    topTechnologies: topEntitiesOfType(entityCounts, "TECHNOLOGY"),
    recentHeadlines,
    topicEvolution: computeTopicEvolution(topicCounts),
  };
}

export function useNewsFeed(): NewsFeedState {
  const [allItems, setAllItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<NewsItem[]>([]);
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loopsCompleted, setLoopsCompleted] = useState(0);

  const cursor = useRef(0);
  const pointsByIso2 = useRef(new Map<string, MapPoint>());
  const topicCountsByIso2 = useRef(new Map<string, Map<Topic, number>>());
  const totalRevealed = useRef(0);

  // Queue of today's items in publish order, walked by `cursor` for playback — separate from
  // `allItems` (the full corpus used for insights) so a background poll never disturbs it.
  const playbackQueueRef = useRef<NewsItem[]>([]);
  const knownUrlsRef = useRef(new Set<string>());
  const hasLoadedRef = useRef(false);
  const revealTimingRef = useRef<RevealTiming>({ revealMinIntervalMs: 9000, revealMaxIntervalMs: 14000 });

  useEffect(() => {
    let cancelled = false;
    loadRevealTiming().then((timing) => {
      if (!cancelled) revealTimingRef.current = timing;
    });
    const source = new StaticJsonlNewsSource();
    source
      .load()
      .then((raw) => {
        if (cancelled) return;
        const items = raw.map(normalizeArticle);
        knownUrlsRef.current = new Set(raw.map((a) => a.url));
        playbackQueueRef.current = selectPlaybackQueue(items);
        hasLoadedRef.current = true;
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

  // Periodically re-checks the static snapshot for newly-exported articles and splices any in.
  // Runs independent of the reveal-scheduling effect below, mutating `playbackQueueRef` in place
  // (not React state) so it never restarts that effect or skips the ticker ahead.
  useEffect(() => {
    const poll = () => {
      if (!hasLoadedRef.current) return;
      const source = new StaticJsonlNewsSource();
      source
        .load()
        .then((raw) => {
          const freshRaw = pickNewArticles(knownUrlsRef.current, raw);
          if (freshRaw.length === 0) return;
          for (const article of freshRaw) knownUrlsRef.current.add(article.url);

          const freshItems = freshRaw.map(normalizeArticle);
          const freshTodayItems = freshItems.filter((item) => isLocalToday(item.fetchedAt));
          playbackQueueRef.current = [...playbackQueueRef.current, ...freshTodayItems];
          setAllItems((prev) => [...prev, ...freshItems]);
        })
        .catch(() => {
          // Transient poll failure - keep cycling through what's already loaded, retry next tick.
        });
    };
    const intervalId = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (loading) return;

    let timeoutId: number;

    const reveal = () => {
      const item = playbackQueueRef.current[cursor.current];
      if (!item) {
        // Playback queue is empty (e.g. right after a local-midnight rollover, before the next
        // poll brings in today's first item) - keep ticking so a later poll is picked up promptly.
        timeoutId = window.setTimeout(reveal, randomInterval(revealTimingRef.current));
        return;
      }

      setHistory((prevHistory) => [item, ...prevHistory].slice(0, HISTORY_LIMIT));

      if (item.isAiRelated) {
        totalRevealed.current += 1;
        if (item.geo) {
          const topicCounts = topicCountsByIso2.current.get(item.geo.iso2) ?? new Map<Topic, number>();
          if (item.topic) {
            topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1);
          }
          topicCountsByIso2.current.set(item.geo.iso2, topicCounts);
          let dominantTopic: Topic | null = null;
          let dominantCount = 0;
          for (const [topic, count] of topicCounts) {
            if (count > dominantCount) {
              dominantTopic = topic;
              dominantCount = count;
            }
          }

          const relevanceRank = Math.max(
            RELEVANCE_RANK[item.menaRelevance ?? "NONE"],
            RELEVANCE_RANK[item.ihorizonsRelevance ?? "NONE"],
          );
          const existing = pointsByIso2.current.get(item.geo.iso2);
          const existingRank = existing ? RELEVANCE_RANK[existing.topRelevanceTier] : 0;
          const topRelevanceTier: RelevanceLevel =
            relevanceRank > existingRank
              ? (item.menaRelevance && RELEVANCE_RANK[item.menaRelevance] === relevanceRank
                  ? item.menaRelevance
                  : item.ihorizonsRelevance) ?? "NONE"
              : existing?.topRelevanceTier ?? "NONE";

          pointsByIso2.current.set(item.geo.iso2, {
            lat: item.geo.lat,
            lng: item.geo.lng,
            iso2: item.geo.iso2,
            count: (existing?.count ?? 0) + 1,
            dominantTopic,
            topRelevanceTier,
          });
          setPoints(Array.from(pointsByIso2.current.values()));
        }
      }

      cursor.current += 1;
      if (cursor.current >= playbackQueueRef.current.length) {
        // Re-select before looping back to the start - drops anything no longer "local today"
        // (self-corrects across a midnight rollover), but never leaves the queue empty.
        playbackQueueRef.current = selectPlaybackQueue(playbackQueueRef.current);
        cursor.current = 0;
        setLoopsCompleted((n) => n + 1);
      }

      timeoutId = window.setTimeout(reveal, randomInterval(revealTimingRef.current));
    };

    // Reveal the first story immediately, then keep cycling.
    reveal();

    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  const current = history.find((item) => item.isAiRelated) ?? null;

  const stats: FeedStats = useMemo(
    () => ({
      totalRevealed: totalRevealed.current,
      loopsCompleted,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, loopsCompleted],
  );

  const corpusInsights = useMemo(() => computeCorpusInsights(allItems), [allItems]);

  // Snapshot today's topic counts for tomorrow's "topic evolution" comparison. Kept out of the
  // computeCorpusInsights memo since writing to localStorage from a memo body is impure.
  useEffect(() => {
    if (allItems.length === 0) return;
    recordTodaySnapshot(corpusInsights.topicCounts, corpusInsights.totalAiStories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems]);

  return { loading, error, allItems, current, history, points, stats, corpusInsights };
}
