import Globe3D from "./Globe3D";
import Map2D from "./Map2D";
import type { MapPoint } from "../hooks/useNewsFeed";
import type { NewsItem } from "../data/types";

export type ViewMode = "3d" | "2d";

interface Props {
  mode: ViewMode;
  points: MapPoint[];
  current: NewsItem | null;
}

export default function MapView({ mode, points, current }: Props) {
  return mode === "3d" ? (
    <Globe3D points={points} current={current} />
  ) : (
    <Map2D points={points} current={current} />
  );
}
