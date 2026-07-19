import type { NewsItem } from "../data/types";

interface Props {
  history: NewsItem[];
}

function renderItems(history: NewsItem[], copy: "a" | "b") {
  return history.map((item, index) => (
    <span className="ticker-item" key={`${copy}-${item.id}`}>
      {index > 0 && <span className="ticker-sep">◆</span>}
      {item.geo && <span className="ticker-flag">{item.geo.flag}</span>}
      {item.title}
    </span>
  ));
}

export default function Ticker({ history }: Props) {
  if (history.length === 0) return null;

  return (
    <div className="ticker">
      <span className="ticker-label">RECENT</span>
      {/* key restarts the scroll animation cleanly whenever a new headline arrives */}
      <div className="ticker-track" key={history[0]?.id}>
        {renderItems(history, "a")}
        {renderItems(history, "b")}
      </div>
    </div>
  );
}
