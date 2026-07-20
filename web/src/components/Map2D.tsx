import { useEffect, useRef, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import type { MapPoint } from "../hooks/useNewsFeed";
import type { NewsItem } from "../data/types";
import { RELEVANCE_COLORS, TOPIC_LABELS } from "../data/taxonomy";

interface Props {
  points: MapPoint[];
  current: NewsItem | null;
}

interface RingDatum {
  id: string;
  coordinates: [number, number];
}

const GEO_URL = "/world/countries-110m.json";
const AUTO_FOLLOW_COOLDOWN_MS = 15000;
const RING_LIFETIME_MS = 4000;
const FOCUS_ZOOM = 2.6;
const DEFAULT_CENTER: [number, number] = [10, 15];
const DEFAULT_ZOOM = 1;
const FLY_DURATION_MS = 1400;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export default function Map2D({ points, current }: Props) {
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [rings, setRings] = useState<RingDatum[]>([]);

  const centerRef = useRef(center);
  const zoomRef = useRef(zoom);
  const userInteractingUntilRef = useRef(0);
  const animFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    centerRef.current = center;
  }, [center]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const handleMoveStart = () => {
    userInteractingUntilRef.current = Date.now() + AUTO_FOLLOW_COOLDOWN_MS;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  useEffect(() => {
    if (!current?.geo) return;
    const target: [number, number] = [current.geo.lng, current.geo.lat];
    const id = current.id;

    setRings((prev) => (prev.some((r) => r.id === id) ? prev : [...prev, { id, coordinates: target }]));
    const cleanupTimer = window.setTimeout(() => {
      setRings((prev) => prev.filter((r) => r.id !== id));
    }, RING_LIFETIME_MS);

    if (Date.now() >= userInteractingUntilRef.current) {
      const startCenter = centerRef.current;
      const startZoom = zoomRef.current;
      const startTime = performance.now();

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      const step = (time: number) => {
        const t = Math.min(1, (time - startTime) / FLY_DURATION_MS);
        const eased = easeInOutCubic(t);
        setCenter([
          startCenter[0] + (target[0] - startCenter[0]) * eased,
          startCenter[1] + (target[1] - startCenter[1]) * eased,
        ]);
        setZoom(startZoom + (FOCUS_ZOOM - startZoom) * eased);
        if (t < 1) animFrameRef.current = requestAnimationFrame(step);
      };
      animFrameRef.current = requestAnimationFrame(step);
    }

    return () => window.clearTimeout(cleanupTimer);
  }, [current]);

  useEffect(
    () => () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    },
    [],
  );

  return (
    <div className="map-view">
      <ComposableMap
        projection="geoEqualEarth"
        width={1000}
        height={600}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup center={center} zoom={zoom} minZoom={1} maxZoom={6} onMoveStart={handleMoveStart}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: { fill: "#152238", stroke: "#2c4568", strokeWidth: 0.4, outline: "none" },
                    hover: { fill: "#1c2d4d", stroke: "#3a5a8c", strokeWidth: 0.5, outline: "none" },
                    pressed: { fill: "#1c2d4d", stroke: "#3a5a8c", strokeWidth: 0.5, outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>

          {points.map((p) => (
            <Marker key={p.iso2} coordinates={[p.lng, p.lat]}>
              <circle
                r={2.6 + Math.min(p.count, 5) * 0.8}
                fill={RELEVANCE_COLORS[p.topRelevanceTier]}
                fillOpacity={0.85}
                stroke="#bdf1ff"
                strokeWidth={0.6}
              >
                <title>{`${p.iso2} — ${p.count} ${p.count === 1 ? "story" : "stories"} · top topic: ${
                  p.dominantTopic ? TOPIC_LABELS[p.dominantTopic] : "—"
                }`}</title>
              </circle>
            </Marker>
          ))}

          {rings.map((r) => (
            <Marker key={r.id} coordinates={r.coordinates}>
              <circle r={3} className="map-pulse-ring" />
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
