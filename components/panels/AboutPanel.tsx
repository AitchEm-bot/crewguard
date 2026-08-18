"use client";
import { useStore } from "@/lib/store";
import { PanelShell } from "./PanelShell";
import { Icon, type IconName } from "../ui/Icon";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "grid", title: "Sense · 20 m grid", body: "FortyGuard's hourly temperature grid gives street-level heat, not a citywide forecast. Each worker's cell drives their heat index." },
  { icon: "activity", title: "Estimate strain", body: "Per-minute strain index from cell heat index, sun/shade/AC exposure, workload and acclimatization — tracked across the whole shift." },
  { icon: "route", title: "Act early", body: "Resequence hot-cell stops into the morning, reroute legs around hot corridors, schedule shaded/AC recovery before a projected limit is crossed." },
  { icon: "lock", title: "Prove it", body: "Every observation and decision is appended to a SHA-256 hash-chained ledger — documentation for OSHA's heat rule (Docket OSHA-2021-0009)." },
];

export function AboutPanel() {
  const { setPanel } = useStore();
  return (
    <PanelShell title="CrewGuard" subtitle="An AI agent that protects outdoor workers from heat instead of just warning them." onClose={() => setPanel(null)} width={400}>
      <div className="p-4 space-y-4 text-[12px] leading-relaxed text-ink-2">
        <p>
          Heat is the leading weather-related killer in the US. Crews still run on citywide forecasts and fixed break schedules while real heat risk changes street by street. CrewGuard replays a Phoenix delivery fleet through a real heatwave day (15 Jul 2023) and lets an autonomous agent keep every courier under a safe strain limit.
        </p>
        <ol className="space-y-2.5">
          {STEPS.map((s) => (
            <li key={s.title} className="flex gap-3 rounded-2xl bg-tile p-3">
              <span className="w-8 h-8 rounded-full bg-white grid place-items-center shrink-0 shadow-[0_1px_3px_rgba(0,0,0,.08)]"><Icon name={s.icon} size={15} /></span>
              <span><span className="block font-semibold text-ink">{s.title}</span><span className="block text-[11px] text-muted mt-0.5">{s.body}</span></span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-muted">
          Try: toggle the agent off in the top-right and scrub to 15:00 — watch the strain gauge cross the limit. Then open the ledger and hit “Tamper demo”.
        </p>
        <p className="text-[10.5px] text-muted-2 leading-snug">
          Demonstration system, not medical advice or a certified compliance instrument. The temperature grid in this build is a synthetic 20 m field modelled on FortyGuard tOS structure; the data provider is swappable for live captures. Basemap © OpenStreetMap contributors © CARTO.
        </p>
      </div>
    </PanelShell>
  );
}
