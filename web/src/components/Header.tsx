import { useEffect, useState } from "react";
import type { ViewMode } from "./MapView";

interface Props {
  mode: ViewMode;
  onToggleMode: () => void;
}

export default function Header({ mode, onToggleMode }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-badge">AI PULSE</span>
        <h1>Global AI News Radar</h1>
      </div>

      <div className="header-live">
        <span className="live-dot" />
        <span className="live-label">LIVE FEED</span>
      </div>

      <div className="header-right">
        <div className="header-clock">
          <span className="clock-time">{time}</span>
          <span className="clock-date">{date}</span>
        </div>
        <button type="button" className="mode-toggle" onClick={onToggleMode}>
          {mode === "3d" ? "Switch to 2D Map" : "Switch to 3D Globe"}
        </button>
      </div>
    </header>
  );
}
