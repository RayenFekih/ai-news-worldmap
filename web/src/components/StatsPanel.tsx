import type { FeedStats } from "../hooks/useNewsFeed";

interface Props {
  stats: FeedStats;
  totalCountries: number;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function StatsPanel({ stats, totalCountries }: Props) {
  return (
    <section className="panel stats-panel">
      <span className="panel-label">Live Session Stats</span>

      <div className="stats-grid">
        <div className="stat-tile">
          <span className="stat-value">{stats.totalRevealed}</span>
          <span className="stat-caption">Stories shown</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">
            {stats.uniqueCountries}
            <span className="stat-value-sub">/{totalCountries}</span>
          </span>
          <span className="stat-caption">Countries lit up</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{stats.topLanguage ?? "—"}</span>
          <span className="stat-caption">Top language</span>
        </div>
        <div className="stat-tile">
          <span className="stat-value">{formatElapsed(stats.elapsedMs)}</span>
          <span className="stat-caption">Session time</span>
        </div>
      </div>
    </section>
  );
}
