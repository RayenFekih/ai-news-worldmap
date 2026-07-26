import type { FeedStats } from "../hooks/useNewsFeed";

interface Props {
  stats: FeedStats;
}

export default function HeaderStats({ stats }: Props) {
  return (
    <div className="header-stats">
      <div className="header-stat">
        <span className="header-stat-value">{stats.totalRevealed}</span>
        <span className="header-stat-caption">Stories</span>
      </div>
    </div>
  );
}
