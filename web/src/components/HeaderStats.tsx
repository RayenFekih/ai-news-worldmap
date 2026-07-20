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

export default function HeaderStats({ stats, totalCountries }: Props) {
  return (
    <div className="header-stats">
      <div className="header-stat">
        <span className="header-stat-value">{stats.totalRevealed}</span>
        <span className="header-stat-caption">Stories</span>
      </div>
      <div className="header-stat">
        <span className="header-stat-value">
          {stats.uniqueCountries}
          <span className="header-stat-value-sub">/{totalCountries}</span>
        </span>
        <span className="header-stat-caption">Countries</span>
      </div>
      <div className="header-stat">
        <span className="header-stat-value">{stats.topLanguage ?? "—"}</span>
        <span className="header-stat-caption">Top language</span>
      </div>
      <div className="header-stat">
        <span className="header-stat-value">{formatElapsed(stats.elapsedMs)}</span>
        <span className="header-stat-caption">Session</span>
      </div>
    </div>
  );
}
