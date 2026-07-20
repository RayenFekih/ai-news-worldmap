import type { ReactNode } from "react";
import type { CorpusInsights, EntityFrequency, TopicDirection } from "../hooks/useNewsFeed";
import type { RelevanceLevel, Topic } from "../data/types";
import { RELEVANCE_COLORS, RELEVANCE_LABELS, TOPIC_COLORS, TOPIC_LABELS } from "../data/taxonomy";

const RELEVANCE_TIERS: RelevanceLevel[] = ["HIGH", "MEDIUM", "LOW", "NONE"];
const UP_COLOR = RELEVANCE_COLORS.HIGH;
const DOWN_COLOR = "#7f93ac";

function formatRelativeTime(seenDate: Date, now: Date): string {
  const diffMs = now.getTime() - seenDate.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function directionArrow(direction: TopicDirection): string {
  switch (direction) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "new":
      return "★";
    default:
      return "—";
  }
}

function directionColor(direction: TopicDirection): string {
  return direction === "up" ? UP_COLOR : direction === "down" ? DOWN_COLOR : "#5a6b80";
}

export function TodayTopicFocusCard(insights: CorpusInsights) {
  const top = (Object.entries(insights.topicCounts) as [Topic, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = top[0]?.[1] ?? 1;

  return (
    <>
      <h3 className="insights-card-title">Today's Topic Focus</h3>
      {top.length === 0 && <p className="insights-empty">No AI stories analyzed yet.</p>}
      {top.map(([topic, count]) => (
        <div className="insight-bar-row" key={topic}>
          <span className="insight-bar-label">
            <span className="insight-bar-dot" style={{ background: TOPIC_COLORS[topic] }} />
            {TOPIC_LABELS[topic]}
          </span>
          <div className="insight-bar-track">
            <div
              className="insight-bar-fill"
              style={{ width: `${(count / max) * 100}%`, background: TOPIC_COLORS[topic] }}
            />
          </div>
          <span className="insight-bar-count">{count}</span>
        </div>
      ))}
    </>
  );
}

function RelevanceBreakdownCard(title: string, counts: Record<RelevanceLevel, number>, sentence: string) {
  const max = Math.max(...RELEVANCE_TIERS.map((tier) => counts[tier]), 1);

  return (
    <>
      <h3 className="insights-card-title">{title}</h3>
      {RELEVANCE_TIERS.map((tier) => (
        <div className="insight-bar-row" key={tier}>
          <span className="insight-bar-label">
            <span className="insight-bar-dot" style={{ background: RELEVANCE_COLORS[tier] }} />
            {RELEVANCE_LABELS[tier]}
          </span>
          <div className="insight-bar-track">
            <div
              className="insight-bar-fill"
              style={{ width: `${(counts[tier] / max) * 100}%`, background: RELEVANCE_COLORS[tier] }}
            />
          </div>
          <span className="insight-bar-count">{counts[tier]}</span>
        </div>
      ))}
      <p className="insights-sentence">{sentence}</p>
    </>
  );
}

export function TodayMenaRelevanceCard(insights: CorpusInsights) {
  return RelevanceBreakdownCard(
    "Today's MENA Relevance",
    insights.menaRelevanceCounts,
    `${insights.menaHighMediumPct}% of AI stories have HIGH or MEDIUM MENA relevance.`,
  );
}

export function TodayAiOpportunitiesCard(insights: CorpusInsights) {
  return RelevanceBreakdownCard(
    "Today's AI Opportunities",
    insights.ihorizonsRelevanceCounts,
    `${insights.ihorizonsHighCount} stories rated HIGH iHorizons relevance today.`,
  );
}

export function PipelineCard(insights: CorpusInsights) {
  return (
    <>
      <h3 className="insights-card-title">Pipeline at Work</h3>
      <div className="pipeline-stat-row">
        <span className="pipeline-stat-value">{insights.avgConfidence}%</span>
        <span className="pipeline-stat-caption">Avg. classification confidence</span>
      </div>
      <div className="pipeline-stat-row">
        <span className="pipeline-stat-value">{insights.bilingualCoveragePct}%</span>
        <span className="pipeline-stat-caption">Translated to Arabic</span>
      </div>
      <div className="pipeline-stat-row">
        <span className="pipeline-stat-value">{insights.nonAiFilteredCount}</span>
        <span className="pipeline-stat-caption">Irrelevant stories auto-filtered</span>
      </div>
    </>
  );
}

function TopEntityTypeCard(title: string, entities: EntityFrequency[]) {
  return (
    <>
      <h3 className="insights-card-title">{title}</h3>
      {entities.length === 0 && <p className="insights-empty">None identified yet.</p>}
      <div className="entity-chip-row">
        {entities.map((entity) => (
          <span className="entity-chip" key={entity.name}>
            {entity.name}
            <span className="entity-chip-count">{entity.count}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export function TopOrganizationsCard(insights: CorpusInsights) {
  return TopEntityTypeCard("Top Organizations", insights.topOrganizations);
}

export function TopModelsCard(insights: CorpusInsights) {
  return TopEntityTypeCard("Top Models", insights.topModels);
}

export function TopTechnologiesCard(insights: CorpusInsights) {
  return TopEntityTypeCard("Top Technologies", insights.topTechnologies);
}

export function AiRightNowCard(insights: CorpusInsights) {
  const stats: Array<[number, string]> = [
    [insights.totalAiStories, "Articles"],
    [insights.countryCount, "Countries"],
    [insights.publisherCount, "Publishers"],
    [insights.languageCount, "Languages"],
    [insights.aiCompanyCount, "AI Companies"],
  ];

  return (
    <>
      <h3 className="insights-card-title">AI Right Now</h3>
      <div className="ai-right-now-grid">
        {stats.map(([value, caption]) => (
          <div className="ai-right-now-tile" key={caption}>
            <span className="ai-right-now-value">{value}</span>
            <span className="ai-right-now-caption">{caption}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function LiveHeadlinesCard(insights: CorpusInsights) {
  const now = new Date();
  return (
    <>
      <h3 className="insights-card-title">Live Headlines</h3>
      {insights.recentHeadlines.length === 0 && <p className="insights-empty">No headlines yet.</p>}
      {insights.recentHeadlines.map((headline) => (
        <div className="headline-row" key={headline.id}>
          {headline.topic && (
            <span className="headline-dot" style={{ background: TOPIC_COLORS[headline.topic] }} />
          )}
          <span className="headline-title">{headline.title}</span>
          <span className="headline-time">{formatRelativeTime(headline.seenDate, now)}</span>
        </div>
      ))}
    </>
  );
}

export function TopicEvolutionCard(insights: CorpusInsights) {
  const { hasComparison, entries } = insights.topicEvolution;

  return (
    <>
      <h3 className="insights-card-title">Topic Evolution</h3>
      {!hasComparison && (
        <p className="insights-empty">No comparison yet — check back tomorrow once today's data has a history to compare against.</p>
      )}
      {hasComparison && entries.length === 0 && <p className="insights-empty">No topic activity to compare.</p>}
      {hasComparison &&
        entries.map((entry) => (
          <div className="insight-bar-row" key={entry.topic}>
            <span className="insight-bar-label">
              <span className="insight-bar-dot" style={{ background: TOPIC_COLORS[entry.topic] }} />
              {TOPIC_LABELS[entry.topic]}
            </span>
            <span className="topic-evolution-arrow" style={{ color: directionColor(entry.direction) }}>
              {directionArrow(entry.direction)}
            </span>
            <span className="topic-evolution-delta">
              {entry.direction === "new" ? "New" : entry.deltaPct === null ? "—" : `${entry.deltaPct > 0 ? "+" : ""}${entry.deltaPct}%`}
            </span>
            <span className="insight-bar-count">{entry.today}</span>
          </div>
        ))}
    </>
  );
}

type InsightCard = (insights: CorpusInsights) => ReactNode;

/** Bar-row / stat-row shaped cards - consistently ~150-190px, safe over the tighter English column. */
export const GROUP_A_CARDS: InsightCard[] = [
  TodayTopicFocusCard,
  TopicEvolutionCard,
  TodayAiOpportunitiesCard,
  PipelineCard,
];

/** Chip-row + grid + list shaped cards - given more headroom over the Arabic column. */
export const GROUP_B_CARDS: InsightCard[] = [
  TodayMenaRelevanceCard,
  TopOrganizationsCard,
  TopModelsCard,
  TopTechnologiesCard,
  AiRightNowCard,
  LiveHeadlinesCard,
];
