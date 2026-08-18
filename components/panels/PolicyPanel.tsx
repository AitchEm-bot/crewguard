"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { DEFAULT_POLICY, SAFE_LIMIT, type Policy } from "@/lib/sim";
import { fmtStrain } from "@/lib/format";
import { PanelShell } from "./PanelShell";
import { Toggle, cx } from "../ui/primitives";
import { Icon } from "../ui/Icon";

const SLIDERS: { key: keyof Policy; label: string; hint: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "recoveryTrigger", label: "Recovery trigger", hint: "projected strain that schedules a break", min: 50, max: 90, step: 1, unit: "" },
  { key: "horizonMin", label: "Projection horizon", hint: "how far ahead the agent looks", min: 10, max: 40, step: 5, unit: " min" },
  { key: "breakMin", label: "Recovery length", hint: "minutes in shade / AC", min: 6, max: 20, step: 1, unit: " min" },
  { key: "minGapMin", label: "Minimum gap", hint: "between agent-scheduled recoveries", min: 10, max: 45, step: 5, unit: " min" },
  { key: "poiRadiusM", label: "Cool-spot radius", hint: "how far a worker is sent for AC/shade", min: 200, max: 1000, step: 50, unit: " m" },
];

export function PolicyPanel() {
  const { policy, setPolicy, setPanel, runs, ready } = useStore();
  const [draft, setDraft] = useState<Policy>(policy);
  const [base, setBase] = useState<Policy>(policy);
  if (base !== policy) { setBase(policy); setDraft(policy); } // resync when policy changes elsewhere
  const dirty = JSON.stringify({ ...draft, agentOn: true }) !== JSON.stringify({ ...policy, agentOn: true });

  return (
    <PanelShell title="Policy" subtitle="What the agent is allowed to do, and when. Changes re-run the whole shift instantly." onClose={() => setPanel(null)} width={380}>
      <div className="p-4 space-y-5">
        <div className="rounded-2xl bg-tile p-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold">Agent mode</div>
            <div className="text-[10.5px] text-muted leading-snug">{policy.agentOn ? "Acting — reroutes, recovery breaks, resequencing." : "Monitor only — warns workers, takes no action."}</div>
          </div>
          <Toggle on={policy.agentOn} onChange={(v) => setPolicy({ agentOn: v })} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Lever label="Resequence stops" hint="hot cells first at shift start" on={draft.resequence} onChange={(v) => setDraft({ ...draft, resequence: v })} />
          <Lever label="Reroute legs" hint="avoid hot corridors" on={draft.reroute} onChange={(v) => setDraft({ ...draft, reroute: v })} />
        </div>

        <div className="space-y-4">
          {SLIDERS.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[12px] font-medium">{s.label}</div>
                  <div className="text-[10px] text-muted">{s.hint}</div>
                </div>
                <div className="text-[14px] font-semibold tabular-nums">{draft[s.key] as number}{s.unit}</div>
              </div>
              <input
                type="range"
                className="cg-range w-full mt-2"
                min={s.min} max={s.max} step={s.step}
                value={draft[s.key] as number}
                onChange={(e) => setDraft({ ...draft, [s.key]: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-line p-3 text-[11px] leading-relaxed text-ink-2">
          Safe limit is fixed at <b>{SAFE_LIMIT}</b>. Fixed breaks (09:30, 12:00 lunch, 15:00) apply in both modes so the comparison is fair.
          {runs && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Outcome label="Agent on" peak={runs.on.fleetPeak} breaches={runs.on.totalBreaches} stops={`${runs.on.stopsDone}/${runs.on.totalStops}`} decisions={runs.on.totalDecisions} />
              <Outcome label="Agent off" peak={runs.off.fleetPeak} breaches={runs.off.totalBreaches} stops={`${runs.off.stopsDone}/${runs.off.totalStops}`} decisions={0} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty || !ready}
            onClick={() => setPolicy({ ...draft, agentOn: policy.agentOn })}
            className={cx("flex-1 h-11 rounded-full text-[12.5px] font-semibold inline-flex items-center justify-center gap-2 transition-all", dirty ? "bg-ink text-white hover:opacity-90" : "bg-tile text-muted")}
          >
            <Icon name="zap" size={14} /> {dirty ? "Apply & re-run shift" : "Policy applied"}
          </button>
          <button type="button" onClick={() => setDraft({ ...DEFAULT_POLICY, agentOn: policy.agentOn })} className="h-11 px-3.5 rounded-full border border-line text-[11.5px] hover:bg-tile">Reset</button>
        </div>
      </div>
    </PanelShell>
  );
}

function Lever({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={cx("rounded-2xl p-3 text-left border transition-colors", on ? "border-ink bg-white" : "border-line bg-tile/60")}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium">{label}</span>
        <span className={cx("w-4 h-4 rounded-full grid place-items-center", on ? "bg-ink text-white" : "border border-line")}>{on && <Icon name="check" size={10} strokeWidth={3} />}</span>
      </div>
      <div className="text-[10px] text-muted mt-0.5">{hint}</div>
    </button>
  );
}

function Outcome({ label, peak, breaches, stops, decisions }: { label: string; peak: number; breaches: number; stops: string; decisions: number }) {
  return (
    <div className="rounded-xl bg-tile p-2.5">
      <div className="text-[10px] text-muted">{label}</div>
      <div className="text-[16px] font-semibold tabular-nums leading-tight">{fmtStrain(peak)} <span className="text-[10px] font-normal text-muted">peak</span></div>
      <div className="text-[10px] text-ink-2">{breaches} breach{breaches === 1 ? "" : "es"} · {stops} stops · {decisions} actions</div>
    </div>
  );
}
