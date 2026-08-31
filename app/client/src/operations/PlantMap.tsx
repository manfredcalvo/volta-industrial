/**
 * "Where the downtime exposure sits" — plant bubble map.
 *
 * One CircleMarker per plant, radius scaled by total downtime exposure,
 * over CARTO Positron tiles (react-leaflet). Coordinates come from the
 * warehouse gold table via /api/charts/plant_exposure — the Lakebase
 * app.line_status mirror doesn't carry plant_lat/plant_lng.
 *
 * Leaflet notes: radius is a top-level prop (react-leaflet calls
 * setRadius on diff); pathOptions go through setStyle; Leaflet CSS is
 * imported in client/src/index.css so tiles size correctly on first paint.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, RefreshCw } from 'lucide-react';
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { fetchChart } from '@/lib/lines';
import { dataMutated } from '@/lib/events';

type PlantExposure = {
  plant_id: string;
  plant_lat: number;
  plant_lng: number;
  line_count: number;
  atrisk_count: number;
  total_exposure_usd: number;
};

const PRIMARY = '#094074'; // matches brand-1; SVG fill won't take var(...)
const DANGER = '#c02323';
const RADIUS_MIN = 6;
const RADIUS_MAX = 34;

function radiusFor(exposure: number, max: number): number {
  if (max <= 0) return RADIUS_MIN;
  const frac = Math.sqrt(Math.max(0, exposure) / max);
  return RADIUS_MIN + frac * (RADIUS_MAX - RADIUS_MIN);
}

function FitBoundsOnSetChange({ plants }: { plants: PlantExposure[] }) {
  const map = useMap();
  const lastKey = useRef<string>('');
  useEffect(() => {
    if (plants.length === 0) return;
    const key = plants.map((p) => p.plant_id).sort().join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;
    const lats = plants.map((p) => p.plant_lat);
    const lngs = plants.map((p) => p.plant_lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    if (Math.abs(maxLat - minLat) < 0.5 && Math.abs(maxLng - minLng) < 0.5) {
      map.setView([plants[0].plant_lat, plants[0].plant_lng], 6, {
        animate: true,
      });
      return;
    }
    map.fitBounds(
      [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      { padding: [40, 40], animate: true },
    );
  }, [plants, map]);
  return null;
}

export function PlantMap() {
  const [plants, setPlants] = useState<PlantExposure[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function reload() {
      fetchChart<PlantExposure>('plant_exposure')
        .then((data) => {
          if (cancelled) return;
          setPlants(data);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError((e as Error).message);
        });
    }
    reload();
    const unsub = dataMutated.subscribe(reload);
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Couldn't load the map: {error}
      </div>
    );
  }

  if (plants === null) {
    return (
      <div className="rounded-xl border border-border bg-card h-[280px] sm:h-[340px] flex items-center justify-center text-sm text-muted-foreground gap-2">
        <RefreshCw className="size-3.5 animate-spin" />
        Loading map…
      </div>
    );
  }

  const maxExposure = plants.reduce(
    (m, p) => Math.max(m, p.total_exposure_usd),
    0,
  );
  const totalExposure = plants.reduce((a, p) => a + p.total_exposure_usd, 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe2 className="size-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold truncate">
            Downtime exposure by plant
          </h3>
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {plants.length} {plants.length === 1 ? 'plant' : 'plants'} · $
          {totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="h-[280px] sm:h-[340px] relative">
        {plants.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No plant exposure in scope.
          </div>
        ) : (
          <MapContainer
            center={[39, -98]}
            zoom={3}
            minZoom={2}
            scrollWheelZoom={false}
            worldCopyJump
            className="h-full w-full"
            style={{ background: 'var(--muted)' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              subdomains={['a', 'b', 'c', 'd']}
              maxZoom={19}
            />
            <FitBoundsOnSetChange plants={plants} />
            {plants.map((p) => (
              <PlantBubble key={p.plant_id} plant={p} max={maxExposure} />
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

function PlantBubble({ plant, max }: { plant: PlantExposure; max: number }) {
  const prevExposure = useRef<number | null>(null);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (prevExposure.current === null) {
      prevExposure.current = plant.total_exposure_usd;
      return;
    }
    if (prevExposure.current === plant.total_exposure_usd) return;
    prevExposure.current = plant.total_exposure_usd;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 1100);
    return () => clearTimeout(t);
  }, [plant.total_exposure_usd]);

  const color = plant.atrisk_count > 0 ? DANGER : PRIMARY;
  const pathOptions = useMemo(
    () => ({
      color,
      fillColor: color,
      fillOpacity: pulsing ? 0.75 : 0.5,
      weight: pulsing ? 4 : 1.5,
    }),
    [pulsing, color],
  );

  return (
    <CircleMarker
      center={[plant.plant_lat, plant.plant_lng]}
      radius={radiusFor(plant.total_exposure_usd, max)}
      pathOptions={pathOptions}
    >
      <Tooltip direction="top" offset={[0, -4]} opacity={1}>
        <div className="text-xs">
          <div className="font-semibold">{plant.plant_id}</div>
          <div>{plant.line_count} lines</div>
          <div>{plant.atrisk_count} at risk</div>
          <div>
            $
            {plant.total_exposure_usd.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{' '}
            exposure
          </div>
        </div>
      </Tooltip>
    </CircleMarker>
  );
}
