"use client";
import { useStore } from "@/lib/store";
import { WORKERS, stopsFor } from "@/lib/fleet";
import { SAFE_LIMIT, TICKS } from "@/lib/sim";
import { LEVEL_COLOR, fmtStrain, fmtTemp } from "@/lib/format";
import { PanelShell } from "./PanelShell";
import { Avatar, Chip, cx } from "../ui/primitives";
import { Icon } from "../ui/Icon";

export function FleetPanel() {
  const { run, tick, selectedWorkerId, selectWorker, setPanel, units, flyTo } = useStore();
  if (!run) return null;
  const sel = run.workers[selectedWorkerId];
  const selStops = stopsFor(selectedWorkerId);
  const orderIndex = new Map(sel.order.map((id, i) => [id, i]));
  const ordered = [...selStops].sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  const doneN = sel.ticks[tick].stopsDone;

  return (
    <PanelShell title="Crew" subtitle="Tap a courier to follow them on the map. Strain is estimated every minute from their 20 m cell." onClose={() => setPanel(null)} width={400}>
      <ul className="p-2">
        {WORKERS.map((w) => {
          const r = run.workers[w.id];
          const t = r.ticks[tick];
          const active = w.id === selectedWorkerId;
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => { selectWorker(w.id); flyTo(t.pos, 15.2); }}
                className={cx("w-full text-left rounded-2xl p-3 flex items-center gap-3 transition-colors", active ? "bg-tile" : "hover:bg-tile/60")}
              >
                <Avatar initials={w.initials} hue={w.hue} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold">{w.name}</span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVEL_COLOR[t.level] }} />
                    <span className="text-[10px] text-muted uppercase tracking-wide">{t.state.toLowerCase()}</span>
                  </div>
                  <div className="text-[10.5px] text-muted truncate">{w.role} · {w.workload} · {w.acclimatized ? "acclimatized" : "not acclimatized"}</div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-tile-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (t.strain / SAFE_LIMIT) * 100)}%`, background: LEVEL_COLOR[t.level] }} />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[18px] font-semibold tabular-nums leading-none" style={{ color: LEVEL_COLOR[t.level] }}>{fmtStrain(t.strain)}</div>
                  <div className="text-[9.5px] text-muted mt-1">{fmtTemp(t.hiF, units)} · {t.stopsDone}/{r.totalStops}</div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold">Route · {WORKERS.find((w) => w.id === selectedWorkerId)?.name}</div>
          <div className="text-[10.5px] text-muted">{doneN}/{sel.totalStops} · {sel.reroutes} reroutes · {sel.recoveries} recoveries</div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Peak strain" value={fmtStrain(Math.max(...sel.ticks.slice(0, tick + 1).map((x) => x.strain)))} />
          <Stat label="Min recovering" value={String(sel.ticks.slice(0, tick + 1).filter((x) => x.state === "RECOVERING").length)} />
          <Stat label="Finish" value={sel.finishedTick != null && sel.finishedTick <= tick ? "done" : sel.finishedTick != null ? "~" + fmtClock(sel.finishedTick) : "> 18:00"} />
        </div>
        <ol className="mt-3 space-y-1">
          {ordered.map((s, i) => {
            const isDone = i < doneN;
            const isNext = i === doneN;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => flyTo(s.pos, 16.2)} className={cx("w-full text-left flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-tile", isNext && "bg-amber/15")}>
                  <span className={cx("w-5 h-5 rounded-full grid place-items-center text-[9.5px] font-semibold shrink-0", isDone ? "bg-ink text-white" : isNext ? "bg-amber text-ink" : "border border-line text-muted")}>
                    {isDone ? <Icon name="check" size={10} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cx("min-w-0 flex-1 truncate text-[11.5px]", isDone && "text-muted line-through decoration-line")}>{s.label}</span>
                  <span className="text-[10px] text-muted tabular-nums shrink-0">{s.serviceMin} min</span>
                  {isNext && <Chip tone="amber">next</Chip>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </PanelShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-tile py-2">
      <div className="text-[15px] font-semibold tabular-nums leading-none">{value}</div>
      <div className="text-[9.5px] text-muted mt-1">{label}</div>
    </div>
  );
}
function fmtClock(tick: number) {
  const m = 7 * 60 + Math.min(tick, TICKS - 1);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
