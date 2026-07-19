import { useCallback, useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { GlobeMethods } from "react-globe.gl";
import type { MapPoint } from "../hooks/useNewsFeed";
import type { NewsItem } from "../data/types";

interface Props {
  points: MapPoint[];
  current: NewsItem | null;
}

interface RingDatum {
  id: string;
  lat: number;
  lng: number;
}

const AUTO_ROTATE_RESUME_MS = 15000;
const RING_LIFETIME_MS = 4000;
const FLY_TO_ALTITUDE = 1.5;

export default function Globe3D({ points, current }: Props) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const resumeTimeoutRef = useRef<number>(undefined);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [rings, setRings] = useState<RingDatum[]>([]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableDamping = true;

    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      window.clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = window.setTimeout(() => {
        controls.autoRotate = true;
      }, AUTO_ROTATE_RESUME_MS);
    });
  }, []);

  useEffect(() => {
    if (!current?.geo) return;
    const { lat, lng } = current.geo;
    const id = current.id;

    setRings((prev) => (prev.some((r) => r.id === id) ? prev : [...prev, { id, lat, lng }]));
    const cleanup = window.setTimeout(() => {
      setRings((prev) => prev.filter((r) => r.id !== id));
    }, RING_LIFETIME_MS);

    const controls = globeRef.current?.controls();
    const userIsIdle = controls ? controls.autoRotate : true;
    if (userIsIdle) {
      globeRef.current?.pointOfView({ lat, lng, altitude: FLY_TO_ALTITUDE }, 1800);
    }

    return () => window.clearTimeout(cleanup);
  }, [current]);

  return (
    <div ref={containerRef} className="map-view">
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        globeImageUrl="/textures/earth-night.jpg"
        bumpImageUrl="/textures/earth-topology.png"
        backgroundImageUrl="/textures/night-sky.png"
        showAtmosphere
        atmosphereColor="#4dd8ff"
        atmosphereAltitude={0.2}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => "#5dd3ff"}
        pointAltitude={0.012}
        pointRadius={(d) => 0.35 + Math.min((d as MapPoint).count, 5) * 0.06}
        pointsMerge={false}
        ringsData={rings}
        ringLat="lat"
        ringLng="lng"
        ringColor={() => (t: number) => `rgba(129, 230, 255, ${1 - t})`}
        ringMaxRadius={6}
        ringPropagationSpeed={3}
        ringRepeatPeriod={RING_LIFETIME_MS / 3}
        onGlobeReady={handleGlobeReady}
      />
    </div>
  );
}
