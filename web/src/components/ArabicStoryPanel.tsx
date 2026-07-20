import type { CSSProperties } from "react";
import type { NewsItem } from "../data/types";
import { ENTITY_TYPE_COLORS, RELEVANCE_COLORS, RELEVANCE_LABELS_AR, TOPIC_COLORS } from "../data/taxonomy";

interface Props {
  item: NewsItem | null;
}

export default function ArabicStoryPanel({ item }: Props) {
  if (!item) {
    return (
      <section className="panel arabic-story-panel rtl-text">
        <span className="panel-label">Now Showing</span>
        <p className="active-story-placeholder">جاري الاتصال بالخلاصة…</p>
      </section>
    );
  }

  return (
    <section className="panel arabic-story-panel rtl-text" key={item.id}>
      <div className="active-story-header">
        {item.topic && (
          <span className="topic-badge" style={{ "--badge-color": TOPIC_COLORS[item.topic] } as CSSProperties}>
            {item.topicAr}
          </span>
        )}
        <span className="panel-label">Now Showing</span>
      </div>

      {item.narrationAr && <h2 className="active-story-title-ar">{item.narrationAr}</h2>}

      <div className="active-story-meta">
        {item.geo && <span className="meta-flag">{item.geo.flag}</span>}
        <span className="meta-country">{item.sourceCountry}</span>
        <span className="meta-dot">•</span>
        <span className="meta-domain">{item.domain}</span>
        <span className="meta-dot">•</span>
        <span className="meta-language">{item.language}</span>
      </div>
      <p className="active-story-source-caption">العنوان الأصلي: {item.title}</p>

      {item.summaryAr && (
        <>
          <span className="ai-summary-label">ملخص الذكاء الاصطناعي:</span>
          <p className="active-story-summary-ar">{item.summaryAr}</p>
        </>
      )}

      {item.entities.length > 0 && (
        <div className="entity-chip-row">
          {item.entities.slice(0, 4).map((entity, i) => (
            <span className="entity-chip" key={`${entity.name}-${i}`}>
              <span className="entity-chip-dot" style={{ background: ENTITY_TYPE_COLORS[entity.type] }} />
              {entity.name}
            </span>
          ))}
        </div>
      )}

      <div className="relevance-badge-row">
        {item.menaRelevance && (
          <span className="relevance-badge" style={{ "--badge-color": RELEVANCE_COLORS[item.menaRelevance] } as CSSProperties}>
            MENA: {RELEVANCE_LABELS_AR[item.menaRelevance]}
          </span>
        )}
        {item.ihorizonsRelevance && (
          <span className="relevance-badge" style={{ "--badge-color": RELEVANCE_COLORS[item.ihorizonsRelevance] } as CSSProperties}>
            iHorizons: {RELEVANCE_LABELS_AR[item.ihorizonsRelevance]}
          </span>
        )}
      </div>
    </section>
  );
}
