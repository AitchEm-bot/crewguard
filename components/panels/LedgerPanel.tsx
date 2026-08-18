"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { workerById } from "@/lib/fleet";
import { verifyLedger, type LedgerEntry, type LedgerType } from "@/lib/sim";
import { TYPE_LABEL, TYPE_TONE, shortHash } from "@/lib/format";
import { PanelShell } from "./PanelShell";
import { Chip, cx } from "../ui/primitives";
import { Icon } from "../ui/Icon";

const FILTERS: { key: "all" | "actions" | LedgerType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "actions", label: "Actions" },
  { key: "RECOVERY", label: "Recovery" },
  { key: "REROUTE", label: "Reroute" },
  { key: "NOTIFY", label: "Notify" },
  { key: "BREACH", label: "Breach" },
];

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LedgerPanel() {
  const { ledgerView, setPanel, tampered, tamper, untamper, policy, run, tick, selectWorker } = useStore();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [open, setOpen] = useState<number | null>(null);
  const broken = useMemo(() => verifyLedger(ledgerView), [ledgerView]);
  const entries = useMemo(() => {
    const list = [...ledgerView].reverse();
    if (filter === "all") return list;
    if (filter === "actions") return list.filter((e) => e.type === "RESEQUENCE" || e.type === "REROUTE" || e.type === "RECOVERY");
    return list.filter((e) => e.type === filter);
  }, [ledgerView, filter]);
  const head = ledgerView[ledgerView.length - 1];

  const exportJson = () => download(`crewguard-ledger-${policy.agentOn ? "agent-on" : "monitor"}-${tick}.json`, JSON.stringify({ generated: "CrewGuard demo", policy, entries: ledgerView }, null, 2), "application/json");
  const exportCsv = () => {
    const rows = [["seq", "time", "actor", "type", "title", "detail", "hash", "prevHash"]];
    for (const e of ledgerView) rows.push([String(e.seq), e.time, e.actor, e.type, e.title, e.detail, e.hash, e.prevHash]);
    download(`crewguard-ledger-${tick}.csv`, rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };

  return (
    <PanelShell
      title="Decision ledger"
      width={440}
      onClose={() => setPanel(null)}
      subtitle={
        <span className="inline-flex items-center gap-2 flex-wrap">
          <span>{ledgerView.length} entries · SHA-256 chained</span>
          {broken === -1 ? (
            <span className="inline-flex items-center gap-1 text-[#1f7a48] font-medium"><Icon name="check" size={12} strokeWidth={2.5} /> verified</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red font-medium"><Icon name="alert" size={12} /> chain broken at #{broken}</span>
          )}
          {head && <span className="font-mono text-[10px] text-muted-2">head {shortHash(head.hash)}</span>}
        </span>
      }
    >
      <div className="px-4 py-3 border-b border-line flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cx("h-7 px-2.5 rounded-full text-[10.5px] font-medium transition-colors", filter === f.key ? "bg-ink text-white" : "bg-tile text-muted hover:text-ink")}>{f.label}</button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={tampered ? untamper : tamper} className={cx("h-7 px-2.5 rounded-full text-[10.5px] font-medium border transition-colors", tampered ? "border-red text-red bg-red/10" : "border-line text-ink-2 hover:bg-tile")}>{tampered ? "Undo tamper" : "Tamper demo"}</button>
      </div>
      {tampered && (
        <div className="mx-4 mt-3 rounded-xl bg-red/10 text-[#b3262c] text-[11px] px-3 py-2 leading-snug">
          An entry was edited after the fact. Re-hashing the chain no longer matches — a supervisor or auditor sees exactly where the record diverges.
        </div>
      )}
      <ol className="p-2">
        {entries.map((e) => (
          <LedgerRow key={e.hash + e.seq} e={e} open={open === e.seq} broken={broken !== -1 && e.seq >= broken} onToggle={() => setOpen(open === e.seq ? null : e.seq)} onWorker={() => e.actor !== "fleet" && selectWorker(e.actor)} />
        ))}
        {entries.length === 0 && <li className="text-[11.5px] text-muted px-3 py-6 text-center">Nothing logged yet for this filter.</li>}
      </ol>
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-line px-4 py-3 flex items-center gap-2">
        <button type="button" onClick={exportJson} className="h-9 px-3.5 rounded-full bg-ink text-white text-[11.5px] font-medium inline-flex items-center gap-1.5 hover:opacity-90"><Icon name="download" size={13} /> Export JSON</button>
        <button type="button" onClick={exportCsv} className="h-9 px-3.5 rounded-full border border-line text-[11.5px] font-medium inline-flex items-center gap-1.5 hover:bg-tile">CSV report</button>
        <span className="ml-auto text-[10px] text-muted-2 text-right leading-tight">{run ? `${run.totalDecisions} decisions this shift` : ""}</span>
      </div>
    </PanelShell>
  );
}

function LedgerRow({ e, open, broken, onToggle, onWorker }: { e: LedgerEntry; open: boolean; broken: boolean; onToggle: () => void; onWorker: () => void }) {
  const tone = TYPE_TONE[e.type];
  return (
    <li className={cx("rounded-2xl transition-colors", open ? "bg-tile" : "hover:bg-tile/60", broken && "outline outline-1 outline-red/40")}>
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5 flex items-start gap-2.5">
        <div className="pt-0.5 shrink-0 w-[62px]"><Chip tone={tone === "ink" ? "ink" : tone === "muted" ? "muted" : tone}>{TYPE_LABEL[e.type]}</Chip></div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium leading-snug">{e.title}</div>
          <div className="text-[10px] text-muted mt-0.5">#{e.seq} · {e.time} · <span role="button" tabIndex={0} onClick={(ev) => { ev.stopPropagation(); onWorker(); }} className={cx(e.actor !== "fleet" && "underline decoration-line hover:decoration-ink")}>{e.actor === "fleet" ? "fleet" : workerById(e.actor).name}</span></div>
        </div>
        <Icon name="chevron" size={14} className={cx("text-muted mt-1 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 -mt-1 fade-in">
          <p className="text-[11.5px] leading-relaxed text-ink-2">{e.detail}</p>
          {Object.keys(e.data).length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
              {Object.entries(e.data).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2 border-b border-line/70 py-0.5"><dt className="text-muted">{k}</dt><dd className="font-medium tabular-nums truncate">{Array.isArray(v) ? v.join(", ") : String(v)}</dd></div>
              ))}
            </dl>
          )}
          <div className="mt-2 font-mono text-[9.5px] text-muted-2 break-all leading-relaxed">
            <div>hash {e.hash}</div>
            <div>prev {e.prevHash}</div>
          </div>
        </div>
      )}
    </li>
  );
}
