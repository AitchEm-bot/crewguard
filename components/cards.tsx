"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { WORKERS, workerById } from "@/lib/fleet";
import { SAFE_LIMIT, TICKS, type WorkerRun } from "@/lib/sim";
import { LEVEL_COLOR, TYPE_LABEL, TYPE_TONE, fmtStrain, fmtTemp } from "@/lib/format";
import { dayInfo } from "@/lib/weather";
import { Icon } from "./ui/Icon";
import { Avatar, Card, Chip, Gauge, StatTile, cx } from "./ui/primitives";

const dateLabel = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function Sparkline({ run, tick, width = 92, height = 26 }: { run: WorkerRun; tick: number; width?: number; height?: number }) {
  const d = useMemo(() => {
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(TICKS / width));
    for (let t = 0; t < TICKS; t += step) {
      const x = (t / (TICKS - 1)) * width;
      const y = height - (Math.min(120, run.ticks[t].strain) / 120) * height;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, [run, width, height]);
  const cx0 = (tick / (TICKS - 1)) * width;
  const limitY = height - (SAFE_LIMIT / 120) * height;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <line x1={0} x2={width} y1={limitY} y2={limitY} stroke="var(--red)" strokeDasharray="2 2" strokeWidth={1} opacity={0.6} />
      <polyline points={d} fill="none" stroke="var(--muted-2)" strokeWidth={1.4} />
      <line x1={cx0} x2={cx0} y1={0} y2={height} stroke="var(--ink)" strokeWidth={1} opacity={0.5} />
      <circle cx={cx0} cy={height - (Math.min(120, run.ticks[tick].strain) / 120) * height} r={2.6} fill={LEVEL_COLOR[run.ticks[tick].level]} stroke="#fff" strokeWidth={1} />
    </svg>
  );
}

/** Reference: "Location" card. */
export function WorkerCard() {
  const { run, tick, selectedWorkerId, units, setPanel, day } = useStore();
  if (!run) return <Card className="p-4 h-full animate-pulse" />;
  const w = workerById(selectedWorkerId);
  const wr = run.workers[w.id];
  const t = wr.ticks[tick];
  const stateTone = t.state === "RECOVERING" ? "green" : t.state === "BREAK" ? "muted" : t.state === "DONE" ? "muted" : t.level === "RED" ? "red" : t.level === "ORANGE" ? "amber" : "outline";
  return (
    <Card className="p-4 h-full flex flex-col fade-in">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-tight leading-none">{w.name}</h2>
            <span className="w-2 h-2 rounded-full" style={{ background: LEVEL_COLOR[t.level] }} />
            <Chip tone={stateTone}>{t.state}</Chip>
          </div>
          <div className="text-[11px] text-muted mt-1.5 truncate">{w.role} · {w.note}</div>
          <div className="text-[11px] text-ink-2 mt-0.5 truncate">{t.target}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10.5px] text-muted">{dateLabel(day)} · high {dayInfo(day).highF}°F</div>
          <div className="mt-1.5 hidden xl:flex items-center justify-end gap-2">
            <Sparkline run={wr} tick={tick} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 flex-1 min-h-[104px]">
        <StatTile icon="thermo" label="Heat index" value={fmtTemp(t.hiF, units)} sub={t.hiEffF !== t.hiF ? `feels ${fmtTemp(t.hiEffF, units)}` : undefined} accent="var(--orange)" />
        <StatTile icon="activity" label="Heat strain" value={fmtStrain(t.strain)} sub={<span style={{ color: LEVEL_COLOR[t.level] }}>{t.level.toLowerCase()}</span>} accent={LEVEL_COLOR[t.level]} />
        <button type="button" onClick={() => setPanel("fleet")} className="text-left">
          <StatTile icon="pin" label="Stops done" value={t.stopsDone} sub={`/ ${wr.totalStops}`} />
        </button>
      </div>
    </Card>
  );
}

/** Reference: photo card slot → dark live "agent activity" feed. */
export function ActivityCard() {
  const { ledgerView, setPanel, run, tick, policy } = useStore();
  const recent = useMemo(() => [...ledgerView].reverse().filter((e) => e.type !== "GENESIS").slice(0, 4), [ledgerView]);
  const decisions = ledgerView.filter((e) => e.type === "RESEQUENCE" || e.type === "REROUTE" || e.type === "RECOVERY").length;
  return (
    <Card dark className="p-4 h-full flex flex-col fade-in relative overflow-hidden">
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-amber/20 blur-2xl pointer-events-none" />
      <div className="flex items-center justify-between relative">
        <div>
          <div className="text-[13px] font-semibold leading-none">Agent activity</div>
          <div className="text-[10.5px] text-white/60 mt-1">{decisions} decisions · {ledgerView.length} entries</div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] text-white/70">
          <span className={cx("w-1.5 h-1.5 rounded-full", policy.agentOn ? "bg-green" : "bg-white/40")} />
          {policy.agentOn ? "acting" : "monitor"}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5 flex-1 relative">
        {recent.length === 0 && <li className="text-[11px] text-white/50">Waiting for shift start…</li>}
        {recent.map((e) => (
          <li key={e.hash} className="flex items-start gap-2 fade-in">
            <span className={cx("mt-[3px] shrink-0 rounded-full px-1.5 py-[2px] text-[8.5px] font-bold uppercase tracking-wide leading-none",
              TYPE_TONE[e.type] === "green" ? "bg-green text-white" : TYPE_TONE[e.type] === "red" ? "bg-red text-white" : TYPE_TONE[e.type] === "amber" ? "bg-amber text-ink" : "bg-white/15 text-white")}>{TYPE_LABEL[e.type]}</span>
            <span className="min-w-0">
              <span className="block text-[11px] leading-tight truncate">{e.title}</span>
              <span className="block text-[9.5px] text-white/50 leading-tight mt-[2px]">{e.time} · {e.actor === "fleet" ? "fleet" : workerById(e.actor).name}</span>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setPanel("ledger")} className="mt-2 self-start text-[10.5px] text-white/80 hover:text-white inline-flex items-center gap-1 relative">
        Open ledger <Icon name="arrowRight" size={11} />
      </button>
      {run && tick >= TICKS - 1 && <span className="sr-only">Shift complete</span>}
    </Card>
  );
}

/** Reference: "Tenants" card — title + copy left, avatars right, big amber gauge centred beneath. */
export function FleetCard() {
  const { run, runs, tick, policy, setPanel, selectWorker } = useStore();
  const peak = useMemo(() => {
    if (!run) return 0;
    let p = 0;
    for (const w of WORKERS) for (let i = 0; i <= tick; i += 3) p = Math.max(p, run.workers[w.id].ticks[i].strain);
    return p;
  }, [run, tick]);
  if (!run || !runs) return <Card className="p-4 h-full animate-pulse" />;
  const recovering = WORKERS.filter((w) => run.workers[w.id].ticks[tick].state === "RECOVERING").length;
  const done = WORKERS.filter((w) => run.workers[w.id].ticks[tick].state === "DONE").length;
  const color = peak >= SAFE_LIMIT ? "var(--red)" : peak >= 80 ? "var(--orange)" : "var(--amber)";
  const breachesSoFar = run.ledger.filter((e) => e.type === "BREACH" && e.tick <= tick).length;
  const decisionsSoFar = run.ledger.filter((e) => e.tick <= tick && (e.type === "RESEQUENCE" || e.type === "REROUTE" || e.type === "RECOVERY")).length;
  return (
    <Card className="p-4 h-full flex flex-col fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold tracking-tight leading-none">Crew</div>
          <div className="text-[10.5px] text-muted mt-1.5 leading-snug">
            {WORKERS.length} on shift · {recovering > 0 ? `${recovering} recovering` : done > 0 ? `${done} finished` : "all active"} ·{" "}
            <button type="button" onClick={() => setPanel("policy")} className="underline decoration-line underline-offset-2 hover:text-ink">{policy.agentOn ? "agent on" : "agent off"}</button>
          </div>
        </div>
        <div className="flex -space-x-2 shrink-0">
          {WORKERS.map((w) => (
            <button key={w.id} type="button" onClick={() => selectWorker(w.id)} title={w.name} className="hover:-translate-y-0.5 transition-transform">
              <Avatar initials={w.initials} hue={w.hue} size={30} ring />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-auto pt-2 flex justify-center">
        <Gauge value={peak} max={120} color={color} size={168}>
          <div className="text-[28px] font-semibold tabular-nums tracking-tight leading-none">{fmtStrain(peak)}</div>
          <div className="text-[10px] text-muted mt-1">peak strain · limit {SAFE_LIMIT}</div>
        </Gauge>
      </div>
      <div className="mt-1.5 text-center text-[9.5px] text-muted-2">
        {decisionsSoFar} actions · <span className={cx(breachesSoFar > 0 && "text-red font-medium")}>{breachesSoFar} breach{breachesSoFar === 1 ? "" : "es"}</span> · off-policy peak {fmtStrain(runs.off.fleetPeak)}
      </div>
    </Card>
  );
}
