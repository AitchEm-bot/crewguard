"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker, ImageSource, GeoJSONSource, StyleSpecification } from "maplibre-gl";
import { useStore } from "@/lib/store";
import { GRID, type LngLat } from "@/lib/geo";
import { heatImageForMinute, legendFor } from "@/lib/heatlayer";
import { DEPOT, POIS, WORKERS, stopsFor } from "@/lib/fleet";
import { SHIFT_START_MIN } from "@/lib/weather";
import { LEVEL_COLOR, fmtStrain, fmtTemp } from "@/lib/format";
import { Icon } from "./ui/Icon";
import { StatPill, cx } from "./ui/primitives";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
// MapLibre 6 spawns a module worker; serve it from /public (see scripts/copy-maplibre-worker.mjs)
if (typeof window !== "undefined") maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
const IMG_COORDS: [LngLat, LngLat, LngLat, LngLat] = [
  [GRID.west, GRID.north], [GRID.east, GRID.north], [GRID.east, GRID.south], [GRID.west, GRID.south],
];

export function MapView() {
  const store = useStore();
  const { run, tick, selectedWorkerId, selectWorker, layer, units, mapCommand } = store;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [portals, setPortals] = useState<{ pins: Record<string, HTMLDivElement>; pill: HTMLDivElement } | null>(null);
  const pinMarkers = useRef<Record<string, Marker>>({});
  const pillMarker = useRef<Marker | null>(null);
  const stopMarkers = useRef<Marker[]>([]);
  const [, force] = useState(0);

  // ---- init map ---------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-112.073, 33.457],
      zoom: 13.7,
      minZoom: 12,
      maxZoom: 18,
      attributionControl: false, // attribution rendered in LegendPill / About (control would sit behind the cards)
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    mapRef.current = map;
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __cgMap?: MLMap; __maplibre?: typeof maplibregl }).__cgMap = map; // dev handle for debugging
      (window as unknown as { __maplibre?: typeof maplibregl }).__maplibre = maplibregl;
    }
    map.on("error", (e) => console.error("[map] error", e.error?.message ?? e));

    map.on("load", () => {
      // frame the crew's zones, leaving room for the floating cards
      map.fitBounds([[-112.102, 33.434], [-112.045, 33.48]], { padding: { top: 70, bottom: 80, left: 60, right: 60 }, duration: 0 });
      // calm the basemap: hide POI clutter, tint parks/water to the reference palette
      for (const l of (map.getStyle() as StyleSpecification).layers ?? []) {
        if (/poi|place_hamlet|housenum/i.test(l.id) && l.type === "symbol") map.setLayoutProperty(l.id, "visibility", "none");
        if (l.type === "fill" && /park|wood|grass|cemetery|golf|pitch|garden|landcover|leisure|green/i.test(l.id)) {
          try { map.setPaintProperty(l.id, "fill-color", "#d6e6cf"); map.setPaintProperty(l.id, "fill-opacity", 1); } catch { /* ignore */ }
        }
        if (l.type === "fill" && /water/i.test(l.id)) {
          try { map.setPaintProperty(l.id, "fill-color", "#c9dde3"); } catch { /* ignore */ }
        }
        if (l.type === "background") {
          try { map.setPaintProperty(l.id, "background-color", "#f4f3ef"); } catch { /* ignore */ }
        }
        if (l.type === "symbol" && /place|label/i.test(l.id)) {
          try { map.setPaintProperty(l.id, "text-color", "#6b7476"); } catch { /* ignore */ }
        }
      }
      const firstSymbol = ((map.getStyle() as StyleSpecification).layers ?? []).find((l) => l.type === "symbol")?.id;

      const url = heatImageForMinute(SHIFT_START_MIN, "relative");
      map.addSource("heat", { type: "image", url: url ?? EMPTY_PNG, coordinates: IMG_COORDS });
      map.addLayer({ id: "heat-layer", type: "raster", source: "heat", paint: { "raster-opacity": 0.82, "raster-resampling": "linear", "raster-fade-duration": 0 } }, firstSymbol);

      map.addSource("trail", { type: "geojson", data: emptyLine() });
      map.addLayer({ id: "trail-line", type: "line", source: "trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111214", "line-width": 2, "line-opacity": 0.35 } }, firstSymbol);
      map.addSource("route", { type: "geojson", data: emptyLine() });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#111214", "line-width": 2.5, "line-dasharray": [1.4, 1.6] } }, firstSymbol);

      // depot + cool spots
      const depot = document.createElement("div");
      depot.className = "cg-depot"; depot.title = DEPOT.name;
      new maplibregl.Marker({ element: depot }).setLngLat(DEPOT.pos).addTo(map);
      for (const p of POIS) {
        const el = document.createElement("div");
        el.className = "cg-poi"; el.title = `${p.name} · ${p.kind === "ac" ? "AC" : "shade"}`;
        new maplibregl.Marker({ element: el }).setLngLat(p.pos).addTo(map);
      }
      // worker pins (React renders into these via portals)
      const pins: Record<string, HTMLDivElement> = {};
      for (const w of WORKERS) {
        const el = document.createElement("div");
        el.style.zIndex = "4";
        pins[w.id] = el;
        pinMarkers.current[w.id] = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(DEPOT.pos).addTo(map);
      }
      const pe = document.createElement("div");
      pe.style.zIndex = "6"; // above pins and their pulse rings
      pillMarker.current = new maplibregl.Marker({ element: pe, anchor: "bottom", offset: [0, -30] }).setLngLat(DEPOT.pos).addTo(map);
      setPortals({ pins, pill: pe });
      setLoaded(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ---- heat raster ---------------------------------------------------------
  const minute = SHIFT_START_MIN + tick;
  const bucket = Math.floor(minute / 15) * 15;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource("heat") as ImageSource | undefined;
    if (!src) return;
    if (layer === "off") { map.setLayoutProperty("heat-layer", "visibility", "none"); return; }
    map.setLayoutProperty("heat-layer", "visibility", "visible");
    const url = heatImageForMinute(bucket, layer);
    if (url) src.updateImage({ url, coordinates: IMG_COORDS });
  }, [bucket, layer, loaded]);

  // ---- markers per tick -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !run) return;
    for (const w of WORKERS) {
      const t = run.workers[w.id].ticks[tick];
      pinMarkers.current[w.id]?.setLngLat(t.pos);
    }
    const sel = run.workers[selectedWorkerId];
    const st = sel.ticks[tick];
    pillMarker.current?.setLngLat(st.pos);
    // current leg
    const route = map.getSource("route") as GeoJSONSource | undefined;
    const leg = st.legIndex >= 0 ? sel.legs[st.legIndex] : null;
    route?.setData(leg ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: leg.path } } : emptyLine());
    // trail so far (subsampled)
    const trail = map.getSource("trail") as GeoJSONSource | undefined;
    const coords: LngLat[] = [];
    for (let i = 0; i <= tick; i += 2) coords.push(sel.ticks[i].pos);
    coords.push(st.pos);
    trail?.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
    force((n) => n + 1);
  }, [tick, run, selectedWorkerId, loaded]);

  // ---- stops of the selected worker ------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !run) return;
    for (const m of stopMarkers.current) m.remove();
    stopMarkers.current = [];
    const sel = run.workers[selectedWorkerId];
    const stops = stopsFor(selectedWorkerId);
    const done = new Set(sel.order.slice(0, sel.ticks[tick].stopsDone));
    for (const s of stops) {
      const el = document.createElement("div");
      el.className = cx("cg-stop", done.has(s.id) && "done");
      el.title = `${s.id.toUpperCase()} · ${s.label} · ${s.serviceMin} min`;
      stopMarkers.current.push(new maplibregl.Marker({ element: el }).setLngLat(s.pos).addTo(map));
    }
  }, [selectedWorkerId, loaded, run, run && run.workers[selectedWorkerId].ticks[tick].stopsDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- fly commands ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapCommand) return;
    map.flyTo({ center: mapCommand.center, zoom: mapCommand.zoom ?? map.getZoom(), duration: 900, essential: true });
  }, [mapCommand]);

  const sel = run?.workers[selectedWorkerId];
  const st = sel?.ticks[tick];

  return (
    <div className="absolute inset-0">
      {/* inline sizing: maplibre.css sets .maplibregl-map{position:relative} which would beat a utility class */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* pins via portals */}
      {portals && run && WORKERS.map((w) => {
        const el = portals.pins[w.id];
        const t = run.workers[w.id].ticks[tick];
        if (!el) return null;
        return createPortal(
          <button
            type="button"
            title={`${w.name} · strain ${fmtStrain(t.strain)}`}
            onClick={(e) => { e.stopPropagation(); selectWorker(w.id); }}
            className={cx("cg-pin", w.id === selectedWorkerId && "selected", (t.level === "RED" || t.state === "RECOVERING") && "pulse")}
            style={{ ["--pin" as string]: t.state === "DONE" ? "#9aa3a4" : LEVEL_COLOR[t.level] }}
          >
            <span />
          </button>,
          el,
          w.id,
        );
      })}

      {/* pill cluster above the selected worker */}
      {portals && st && sel && createPortal(
        <div className="flex items-end gap-1.5 fade-in" style={{ pointerEvents: "none" }}>
          <StatPill value={fmtStrain(st.strain)} label="Strain" tone={st.level === "RED" ? "red" : st.level === "ORANGE" ? "amber" : "ink"} />
          <StatPill value={fmtTemp(st.hiF, units)} label="Heat index · cell" />
          <StatPill value={`${st.stopsDone}/${sel.totalStops}`} label="Stops" />
        </div>,
        portals.pill,
      )}

      {/* right-side controls */}
      <div className="absolute right-3 top-[68px] z-10 flex flex-col gap-2 items-end">
        <div className="flex flex-col rounded-full bg-white border border-line shadow-[var(--shadow-soft)] overflow-hidden">
          <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="w-9 h-9 grid place-items-center hover:bg-tile"><Icon name="plus" size={15} /></button>
          <div className="h-px bg-line mx-2" />
          <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="w-9 h-9 grid place-items-center hover:bg-tile"><Icon name="minus" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
function emptyLine(): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };
}

/** Floating legend for the active heat layer. */
export function LegendPill() {
  const { layer, tick } = useStore();
  const minute = SHIFT_START_MIN + tick;
  const legend = useMemo(() => legendFor(layer, minute), [layer, minute]);
  if (layer === "off") return null;
  return (
    <div className="rounded-full bg-white/90 backdrop-blur border border-white/70 shadow-[var(--shadow-soft)] pl-3 pr-3 h-10 flex items-center gap-2.5 fade-in">
      <span className="text-[10.5px] font-medium text-ink-2 whitespace-nowrap">{layer === "relative" ? "Air temp" : "Heat index"}</span>
      <span className="text-[9.5px] text-muted tabular-nums">{legend.min}</span>
      <span className="h-2 w-[86px] rounded-full" style={{ background: `linear-gradient(90deg, ${legend.stops.map((s) => `${s.color} ${Math.round(s.t * 100)}%`).join(", ")})` }} />
      <span className="text-[9.5px] text-muted tabular-nums">{legend.max}</span>
      <span className="text-[9.5px] text-muted-2 whitespace-nowrap">20 m cells</span>
      <span className="text-[8.5px] text-muted-2 whitespace-nowrap border-l border-line pl-2">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="hover:text-ink">OpenStreetMap</a> · <a href="https://carto.com/attributions" target="_blank" rel="noreferrer" className="hover:text-ink">CARTO</a></span>
    </div>
  );
}

