import { useEffect, useState } from "react";
import type { NewsItem } from "../data/types";

interface Props {
  item: NewsItem | null;
}

function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
}

export default function ActiveStoryPanel({ item }: Props) {
  const [imgStage, setImgStage] = useState<"social" | "favicon" | "none">("social");

  useEffect(() => {
    setImgStage("social");
  }, [item?.id]);

  if (!item) {
    return (
      <section className="panel active-story-panel">
        <span className="panel-label">Now Showing</span>
        <p className="active-story-placeholder">Connecting to the feed…</p>
      </section>
    );
  }

  const imgSrc = imgStage === "social" ? item.socialImage : imgStage === "favicon" ? faviconUrl(item.domain) : null;

  return (
    <section className="panel active-story-panel" key={item.id}>
      <span className="panel-label">Now Showing</span>

      <div className="active-story-body">
        <div className="active-story-thumb">
          {imgSrc ? (
            <img
              src={imgSrc}
              alt=""
              onError={() => setImgStage(imgStage === "social" ? "favicon" : "none")}
            />
          ) : (
            <div className="active-story-thumb-fallback">{item.domain.charAt(0).toUpperCase()}</div>
          )}
        </div>

        <div className="active-story-text">
          <h2 className="active-story-title">{item.title}</h2>
          <div className="active-story-meta">
            {item.geo && <span className="meta-flag">{item.geo.flag}</span>}
            <span className="meta-country">{item.sourceCountry}</span>
            <span className="meta-dot">•</span>
            <span className="meta-domain">{item.domain}</span>
            <span className="meta-dot">•</span>
            <span className="meta-language">{item.language}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
