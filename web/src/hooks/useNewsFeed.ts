import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeArticle, StaticJsonlNewsSource } from "../data/newsSource";
import { getYesterdaySnapshot, recordTodaySnapshot } from "../data/topicSnapshotStore";
import type { EntityType, NewsItem, RelevanceLevel, Topic } from "../data/types";

const MIN_INTERVAL_MS = 9000;
const MAX_INTERVAL_MS = 14000;
const HISTORY_LIMIT = 8;
const TOP_ENTITY_TYPE_LIMIT = 5;
const RECENT_HEADLINES_LIMIT = 3;

const RELEVANCE_RANK: Record<RelevanceLevel, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };

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
  seenDate: Date;
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

function nextIntervalMs(): number {
  return MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);
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

  const recentHeadlines: RecentHeadline[] = aiItems
    .filter((item): item is NewsItem & { seenDate: Date } => item.seenDate !== null)
    .sort((a, b) => b.seenDate.getTime() - a.seenDate.getTime())
    .slice(0, RECENT_HEADLINES_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.narrationEn ?? item.title,
      seenDate: item.seenDate,
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
  const [startTime] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const cursor = useRef(0);
  const countriesSeen = useRef(new Set<string>());
  const languageCounts = useRef(new Map<string, number>());
  const pointsByIso2 = useRef(new Map<string, MapPoint>());
  const topicCountsByIso2 = useRef(new Map<string, Map<Topic, number>>());
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

      setHistory((prevHistory) => [item, ...prevHistory].slice(0, HISTORY_LIMIT));

      if (item.isAiRelated) {
        totalRevealed.current += 1;
        if (item.geo) {
          countriesSeen.current.add(item.geo.iso2);

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
        languageCounts.current.set(item.language, (languageCounts.current.get(item.language) ?? 0) + 1);
      }

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

  const current = history.find((item) => item.isAiRelated) ?? null;

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
