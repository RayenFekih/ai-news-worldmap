import type { NewsItem } from "../data/types";
import { TOPIC_COLORS } from "../data/taxonomy";

interface Props {
  items: NewsItem[];
}

function renderItems(items: NewsItem[], copy: "a" | "b") {
  return items.map((item, index) => (
    <span
      className={`ticker-item${item.isAiRelated ? "" : " ticker-item--rejected"}`}
      key={`${copy}-${item.id}`}
    >
      {index > 0 && <span className="ticker-sep">◆</span>}
      {item.isAiRelated && item.topic && (
        <span className="ticker-topic-dot" style={{ background: TOPIC_COLORS[item.topic] }} />
      )}
      {item.geo && <span className="ticker-flag">{item.geo.flag}</span>}
      {item.isAiRelated ? (
        <span className="ticker-ar rtl-text">{item.narrationAr ?? item.title}</span>
      ) : (
        <>
          <span className="ticker-rejected-tag">FILTERED</span>
          {item.title}
          {item.rejectionReason && (
            <span className="ticker-rejected-reason">
              {" "}
              — {item.rejectionReason.slice(0, 60)}
              {item.rejectionReason.length > 60 ? "…" : ""}
            </span>
          )}
        </>
      )}
    </span>
  ));
}

/**
 * Runs independently of the "now showing" reveal cycle - continuously scrolls through the whole
 * loaded corpus (not just recently-revealed items), so it never restarts/jumps when the story
 * panels switch.
 */
export default function Ticker({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="ticker">
      <span className="ticker-label">ALL NEWS</span>
      <div className="ticker-track">
        {renderItems(items, "a")}
        {renderItems(items, "b")}
      </div>
    </div>
  );
}
