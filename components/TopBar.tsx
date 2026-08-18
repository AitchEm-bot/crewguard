"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { POIS, STOPS, WORKERS, workerById } from "@/lib/fleet";
import type { LngLat } from "@/lib/geo";
import type { HeatLayerMode } from "@/lib/heatlayer";
import { ARCHIVE_MONTH, DAY_HIGHS_F, dayInfo } from "@/lib/weather";
import { Icon } from "./ui/Icon";
import { Avatar, Toggle, cx } from "./ui/primitives";
import { CalendarChip, SelectChip } from "./ui/pickers";

const AREAS: Record<string, { label: string; hint: string; center: LngLat; zoom: number }> = {
  downtown: { label: "Downtown", hint: "Whole crew in view", center: [-112.072, 33.455], zoom: 14 },
  roosevelt: { label: "Roosevelt Row", hint: "A. Ruiz · Midtown west", center: [-112.072, 33.4595], zoom: 15 },
  garfield: { label: "Garfield · Coronado", hint: "B. Okafor · e-bike zone", center: [-112.058, 33.465], zoom: 15 },
  warehouse: { label: "Warehouse District", hint: "C. Delgado · hottest cells", center: [-112.06, 33.444], zoom: 15 },
  capitol: { label: "Capitol", hint: "D. Nguyen · on foot", center: [-112.09, 33.447], zoom: 14.8 },
  encanto: { label: "Encanto Park", hint: "Coolest cells in the grid", center: [-112.09, 33.474], zoom: 14.8 },
};

const LAYER_SWATCH: Record<HeatLayerMode, string> = {
  relative: "linear-gradient(90deg, rgba(64,150,168,.7), rgba(200,220,210,0) 45%, rgba(250,210,90,.8) 65%, rgba(232,100,52,.9))",
  heatindex: "linear-gradient(90deg, rgba(252,214,100,.7), rgba(238,120,56,.85), rgba(176,40,88,.9))",
  off: "repeating-linear-gradient(45deg, #e6eae8 0 4px, #fff 4px 8px)",
};
const Swatch = ({ mode }: { mode: HeatLayerMode }) => <span className="block w-8 h-4 rounded-full border border-line" style={{ background: LAYER_SWATCH[mode] }} />;

type Hit = { kind: "worker" | "stop" | "poi"; id: string; title: string; sub: string; pos: LngLat; workerId?: string };

export function TopBar() {
  const { layer, setLayer, policy, setPolicy, flyTo, selectWorker, run, tick, day, setDay, detailsHidden, setDetailsHidden } = useStore();
  const [area, setArea] = useState("downtown");
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocus(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [focus]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out: Hit[] = [];
    for (const w of WORKERS) {
      if (w.name.toLowerCase().includes(s) || w.id.includes(s) || w.role.toLowerCase().includes(s)) {
        const pos = run ? run.workers[w.id].ticks[tick].pos : [-112.072, 33.455] as LngLat;
        out.push({ kind: "worker", id: w.id, title: w.name, sub: w.role, pos, workerId: w.id });
      }
    }
    for (const p of POIS) if (p.name.toLowerCase().includes(s)) out.push({ kind: "poi", id: p.id, title: p.name, sub: p.kind === "ac" ? "Air-conditioned recovery spot" : "Shaded recovery spot", pos: p.pos });
    for (const st of STOPS) if (st.label.toLowerCase().includes(s) || st.id === s) out.push({ kind: "stop", id: st.id, title: `${st.id.toUpperCase()} · ${st.label}`, sub: `${workerById(st.workerId).name} · ${st.serviceMin} min service`, pos: st.pos, workerId: st.workerId });
    return out.slice(0, 8);
  }, [q, run, tick]);

  const pick = (h: Hit) => {
    if (h.workerId) selectWorker(h.workerId);
    flyTo(h.pos, h.kind === "worker" ? 15.5 : 16);
    setQ(""); setFocus(false);
  };

  const info = dayInfo(day);

  return (
    <div className="absolute top-3 left-3 right-3 z-30 flex items-center gap-2 pointer-events-none">
      {/* search */}
      <div ref={boxRef} className="relative pointer-events-auto w-[280px] max-w-[30vw] shrink-0">
        <div className={cx("h-9 rounded-full bg-white/90 backdrop-blur border border-line flex items-center gap-2 px-3 shadow-[var(--shadow-soft)]", focus && "ring-2 ring-ink/10 bg-white")}>
          <Icon name="search" size={15} className="text-muted shrink-0" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setFocus(true); }}
            onFocus={() => setFocus(true)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none text-[12px] placeholder:text-muted-2 min-w-0"
          />
          {q && <button type="button" onClick={() => setQ("")} className="text-muted hover:text-ink"><Icon name="x" size={13} /></button>}
        </div>
        {focus && hits.length > 0 && (
          <div className="absolute mt-1.5 left-0 right-0 z-50 rounded-2xl bg-white/95 backdrop-blur-xl border border-white/70 shadow-[var(--shadow)] p-1.5 pop-in">
            {hits.map((h) => (
              <button key={h.kind + h.id} type="button" onClick={() => pick(h)} className="w-full text-left rounded-xl px-3 py-2 hover:bg-tile flex items-center gap-3">
                <span className={cx("w-7 h-7 rounded-full grid place-items-center shrink-0", h.kind === "worker" ? "bg-amber/25 text-[#8a5a00]" : h.kind === "poi" ? "bg-green/15 text-[#1f7a48]" : "bg-tile text-ink-2")}>
                  <Icon name={h.kind === "worker" ? "users" : h.kind === "poi" ? "umbrella" : "pin"} size={13} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium truncate">{h.title}</span>
                  <span className="block text-[10.5px] text-muted truncate">{h.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* filter chips (menus render in a body portal — never clipped) */}
      <div className="pointer-events-auto flex items-center gap-2 min-w-0">
        <SelectChip<HeatLayerMode>
          label="Layer"
          value={layer}
          onChange={setLayer}
          minWidth={150}
          width={260}
          options={[
            { value: "relative", label: "Heat vs mean", hint: "20 m cells · deviation from city mean", leading: <Swatch mode="relative" /> },
            { value: "heatindex", label: "Heat index", hint: "NWS heat index per cell (°F)", leading: <Swatch mode="heatindex" /> },
            { value: "off", label: "Off", hint: "Basemap only", leading: <Swatch mode="off" /> },
          ]}
        />
        <div className="hidden lg:block">
          <SelectChip
            label="Fleet"
            value="phx"
            onChange={() => {}}
            minWidth={150}
            width={270}
            options={[
              { value: "phx", label: "PHX couriers · 4", hint: "Downtown Phoenix delivery crew", leading: <span className="flex -space-x-1.5">{WORKERS.map((w) => <Avatar key={w.id} initials={w.initials} hue={w.hue} size={20} ring />)}</span> },
            ]}
          />
        </div>
        <div className="hidden md:block">
          <CalendarChip
            value={day}
            year={ARCHIVE_MONTH.year}
            month={ARCHIVE_MONTH.month}
            onChange={setDay}
            dayMeta={(d) => {
              const hi = DAY_HIGHS_F[d];
              if (hi == null) return { disabled: true };
              return { dot: hi >= 118 ? "var(--red)" : hi >= 114 ? "var(--orange)" : hi >= 110 ? "var(--amber)" : "var(--green)", title: `High ${hi}°F${hi >= 110 ? " · Excessive Heat Warning" : ""}` };
            }}
            footer={
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber" />≥110°F <span className="w-1.5 h-1.5 rounded-full bg-orange ml-1" />≥114 <span className="w-1.5 h-1.5 rounded-full bg-red ml-1" />≥118</span>
                <span className="font-medium text-ink">{info.highF}°F · {info.advisory === "None" ? "no advisory" : info.advisory.replace("Excessive Heat Warning", "EHW")}</span>
              </div>
            }
          />
        </div>
        <SelectChip
          label="Area"
          value={area}
          onChange={(v) => { setArea(v); flyTo(AREAS[v].center, AREAS[v].zoom); }}
          minWidth={140}
          width={250}
          options={Object.entries(AREAS).map(([k, v]) => ({ value: k, label: v.label, hint: v.hint, leading: <span className="w-6 h-6 rounded-full bg-tile grid place-items-center text-ink-2"><Icon name="pin" size={12} /></span> }))}
        />
      </div>

      {/* focus mode: hide the detail cards, keep map + replay + legend */}
      <button
        type="button"
        onClick={() => setDetailsHidden(!detailsHidden)}
        title={detailsHidden ? "Show details (D)" : "Hide details (D)"}
        aria-pressed={detailsHidden}
        className={cx("pointer-events-auto ml-auto shrink-0 w-10 h-10 rounded-full grid place-items-center border shadow-[var(--shadow-soft)] transition-colors", detailsHidden ? "bg-ink text-white border-ink" : "bg-white/90 backdrop-blur border-line text-ink-2 hover:bg-white")}
      >
        <Icon name={detailsHidden ? "grid" : "eye"} size={16} />
      </button>

      {/* agent toggle */}
      <div className="pointer-events-auto flex items-center gap-2 h-10 rounded-full bg-ink text-white pl-4 pr-1.5 shadow-[0_10px_24px_-10px_rgba(0,0,0,.6)] shrink-0">
        <span className="relative flex h-2 w-2">
          {policy.agentOn && <span className="absolute inline-flex h-full w-full rounded-full bg-green opacity-75 animate-ping" />}
          <span className={cx("relative inline-flex rounded-full h-2 w-2", policy.agentOn ? "bg-green" : "bg-white/40")} />
        </span>
        <span className="text-[11.5px] font-medium whitespace-nowrap">
          {policy.agentOn ? "Agent acting" : "Monitor only"}
        </span>
        <div className="ml-1">
          <Toggle on={policy.agentOn} onChange={(v) => setPolicy({ agentOn: v })} />
        </div>
      </div>
    </div>
  );
}
