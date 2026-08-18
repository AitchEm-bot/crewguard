"use client";
// Global app state: simulation runs (policy on/off), replay clock, selection,
// layers, panels. Runs are computed once per policy parameter set; toggling
// the agent on/off is instant because both runs are kept.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_POLICY, runFleet, TICKS, type FleetRun, type LedgerEntry, type Policy } from "./sim";
import type { HeatLayerMode } from "./heatlayer";
import { WORKERS } from "./fleet";
import type { LngLat } from "./geo";
import { DEFAULT_DAY, setReplayDay } from "./weather";

export type Panel = null | "fleet" | "ledger" | "policy" | "about";
export type Units = "F" | "C";
export const SPEEDS = [30, 60, 120, 300] as const;

export interface MapCommand { type: "fly"; center: LngLat; zoom?: number; nonce: number }

interface Store {
  policy: Policy;
  setPolicy: (p: Partial<Policy>) => void;
  day: string; // ISO date of the replayed shift
  setDay: (iso: string) => void;
  detailsHidden: boolean; // focus mode: map + replay + legend only
  setDetailsHidden: (b: boolean) => void;
  runs: { on: FleetRun; off: FleetRun } | null;
  run: FleetRun | null; // active run per policy.agentOn
  ready: boolean;
  tick: number;
  setTick: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (s: number) => void;
  restart: () => void;
  selectedWorkerId: string;
  selectWorker: (id: string) => void;
  layer: HeatLayerMode;
  setLayer: (l: HeatLayerMode) => void;
  units: Units;
  setUnits: (u: Units) => void;
  panel: Panel;
  setPanel: (p: Panel) => void;
  chatOpen: boolean;
  setChatOpen: (b: boolean) => void;
  ledgerView: LedgerEntry[]; // entries up to current tick (possibly tampered copy)
  tampered: boolean;
  tamper: () => void;
  untamper: () => void;
  mapCommand: MapCommand | null;
  flyTo: (center: LngLat, zoom?: number) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicyState] = useState<Policy>(DEFAULT_POLICY);
  const [day, setDayState] = useState<string>(DEFAULT_DAY);
  const [detailsHidden, setDetailsHidden] = useState(false);
  const [runs, setRuns] = useState<{ on: FleetRun; off: FleetRun } | null>(null);
  const [tick, setTickState] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(120);
  const [selectedWorkerId, selectWorker] = useState(WORKERS[0].id);
  const [layer, setLayer] = useState<HeatLayerMode>("relative");
  const [units, setUnits] = useState<Units>("F");
  const [panel, setPanel] = useState<Panel>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [tampered, setTampered] = useState(false);
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);

  // (re)compute both runs whenever a non-toggle policy parameter or the day changes
  const paramsKey = JSON.stringify({ ...policy, agentOn: undefined, day });
  useEffect(() => {
    // defer so first paint (loading state) is not blocked
    const id = window.setTimeout(() => {
      const base = { ...policy };
      setRuns({ on: runFleet({ ...base, agentOn: true }, day), off: runFleet({ ...base, agentOn: false }, day) });
    }, 10);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);
  const setDay = useCallback((iso: string) => { setReplayDay(iso); setDayState(iso); setTickState(0); }, []);

  const run = runs ? (policy.agentOn ? runs.on : runs.off) : null;

  // replay clock — interval-based (keeps ticking when the tab is backgrounded,
  // where requestAnimationFrame would pause)
  const acc = useRef(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !runs) { last.current = null; return; }
    const id = window.setInterval(() => {
      const now = performance.now();
      if (last.current == null) last.current = now;
      const dt = Math.min(1.5, (now - last.current) / 1000);
      last.current = now;
      acc.current += dt * (speed / 60); // ticks per second
      if (acc.current >= 1) {
        const step = Math.floor(acc.current);
        acc.current -= step;
        setTickState((t) => {
          const n = t + step;
          if (n >= TICKS - 1) { setPlaying(false); return TICKS - 1; }
          return n;
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, runs]);

  const setTick = useCallback((t: number) => setTickState(Math.max(0, Math.min(TICKS - 1, Math.round(t)))), []);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    // dev handle so headless screenshots can scrub the replay
    (window as unknown as { __cgSetTick?: (t: number, play?: boolean) => void }).__cgSetTick = (t, play = false) => { setTick(t); setPlaying(play); };
  }, [setTick]);
  const restart = useCallback(() => { setTickState(0); setPlaying(true); }, []);
  const setPolicy = useCallback((p: Partial<Policy>) => setPolicyState((s) => ({ ...s, ...p })), []);
  const flyTo = useCallback((center: LngLat, zoom?: number) => setMapCommand({ type: "fly", center, zoom, nonce: Math.random() }), []);

  const ledgerView = useMemo(() => {
    if (!run) return [];
    const upTo = run.ledger.filter((e) => e.tick <= tick);
    if (!tampered || upTo.length < 6) return upTo;
    // Tamper demo: someone edits an old RECOVERY into a shorter break after the fact.
    const idx = upTo.findIndex((e) => e.type === "RECOVERY" || e.type === "NOTIFY");
    if (idx < 0) return upTo;
    const copy = upTo.slice();
    const e = copy[idx];
    copy[idx] = { ...e, title: e.title.replace(/Recovery break/, "Short pause").replace(/Exposure \w+/, "Exposure GREEN"), detail: "(edited after the fact) " + e.detail, data: { ...e.data, minutes: 3 } };
    return copy;
  }, [run, tick, tampered]);

  const value: Store = {
    policy, setPolicy, day, setDay, detailsHidden, setDetailsHidden, runs, run, ready: !!runs,
    tick, setTick, playing, setPlaying, speed, setSpeed, restart,
    selectedWorkerId, selectWorker, layer, setLayer, units, setUnits,
    panel, setPanel, chatOpen, setChatOpen,
    ledgerView, tampered, tamper: () => setTampered(true), untamper: () => setTampered(false),
    mapCommand, flyTo,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
