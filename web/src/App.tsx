import { useState } from "react";
import Header from "./components/Header";
import MapView from "./components/MapView";
import type { ViewMode } from "./components/MapView";
import ActiveStoryPanel from "./components/ActiveStoryPanel";
import ArabicStoryPanel from "./components/ArabicStoryPanel";
import InsightsPanel from "./components/InsightsPanel";
import { GROUP_A_CARDS, GROUP_B_CARDS } from "./components/insightCards";
import Ticker from "./components/Ticker";
import { useNewsFeed } from "./hooks/useNewsFeed";
import "./App.css";

export default function App() {
  const { loading, error, allItems, current, points, stats, corpusInsights } = useNewsFeed();
  const [mode, setMode] = useState<ViewMode>("3d");

  return (
    <div className="app">
      <Header
        mode={mode}
        onToggleMode={() => setMode((m) => (m === "3d" ? "2d" : "3d"))}
        stats={stats}
      />

      <main className="stage">
        <MapView mode={mode} points={points} current={current} />

        {error && <div className="error-banner">Failed to load news data: {error}</div>}
        {loading && !error && <div className="loading-banner">Loading AI news feed…</div>}

        <div className="overlay column-left">
          <div className="kpi-slot">
            <InsightsPanel label="Relevance & Entities" cards={GROUP_B_CARDS} insights={corpusInsights} />
          </div>
          <div className="story-slot">
            <ActiveStoryPanel item={current} />
          </div>
        </div>
        <div className="overlay column-right">
          <div className="kpi-slot">
            <InsightsPanel label="AI Insights" cards={GROUP_A_CARDS} insights={corpusInsights} />
          </div>
          <div className="story-slot">
            <ArabicStoryPanel item={current} />
          </div>
        </div>
      </main>

      <Ticker items={allItems} />
    </div>
  );
}
