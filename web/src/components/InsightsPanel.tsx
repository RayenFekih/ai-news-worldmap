import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CorpusInsights } from "../hooks/useNewsFeed";

interface Props {
  label: string;
  cards: Array<(insights: CorpusInsights) => ReactNode>;
  insights: CorpusInsights;
}

const DWELL_MS = 10000;

export default function InsightsPanel({ label, cards, insights }: Props) {
  const [cardIndex, setCardIndex] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!pausedRef.current) {
        setCardIndex((i) => (i + 1) % cards.length);
      }
    }, DWELL_MS);
    return () => window.clearInterval(id);
  }, [cards.length]);

  return (
    <section
      className="panel insights-panel"
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
    >
      <span className="panel-label">{label}</span>
      <div className="insights-card" key={cardIndex}>
        {cards[cardIndex](insights)}
      </div>
    </section>
  );
}
