import { useMemo, useState } from "react";
import Header from "./components/Header";
import MapView from "./components/MapView";
import type { ViewMode } from "./components/MapView";
import ActiveStoryPanel from "./components/ActiveStoryPanel";
import StatsPanel from "./components/StatsPanel";
import Ticker from "./components/Ticker";
import { useNewsFeed } from "./hooks/useNewsFeed";
import "./App.css";

export default function App() {
  const { loading, error, allItems, current, history, points, stats } = useNewsFeed();
  const [mode, setMode] = useState<ViewMode>("3d");

  const totalCountries = useMemo(() => {
    const iso2s = new Set<string>();
    for (const item of allItems) {
      if (item.geo) iso2s.add(item.geo.iso2);
    }
    return iso2s.size;
  }, [allItems]);

  return (
    <div className="app">
      <Header mode={mode} onToggleMode={() => setMode((m) => (m === "3d" ? "2d" : "3d"))} />

      <main className="stage">
        <MapView mode={mode} points={points} current={current} />

        {error && <div className="error-banner">Failed to load news data: {error}</div>}
        {loading && !error && <div className="loading-banner">Loading AI news feed…</div>}

        <div className="overlay overlay-left">
          <ActiveStoryPanel item={current} />
        </div>
        <div className="overlay overlay-right">
          <StatsPanel stats={stats} totalCountries={totalCountries} />
        </div>
      </main>

      <Ticker history={history} />
    </div>
  );
}
