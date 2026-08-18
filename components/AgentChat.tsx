"use client";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { SUGGESTED, answer } from "@/lib/agent-chat";
import { Icon, Logo } from "./ui/Icon";
import { cx } from "./ui/primitives";

interface Msg { role: "agent" | "user"; text: string }

export function AgentChat() {
  const { runs, run, policy, tick, selectedWorkerId, units, setChatOpen } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Hi, I'm the CrewGuard agent. Ask me why I made a decision, who is at risk right now, or for a compliance summary — every answer comes from the ledger." },
  ]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs]);

  const ask = (q: string) => {
    if (!q.trim() || !runs || !run) return;
    const reply = answer(q, { runs, run, policy, tick, selectedWorkerId, units });
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "agent", text: reply }]);
    setInput("");
  };

  return (
    <div className="w-[360px] max-w-[calc(100vw-140px)] h-[460px] max-h-full rounded-[22px] bg-white/92 backdrop-blur-xl border border-white/70 shadow-[var(--shadow)] flex flex-col overflow-hidden pop-in">
      <div className="px-4 py-3 border-b border-line flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-ink text-white grid place-items-center"><Logo size={22} className="text-white" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-none">CrewGuard agent</div>
          <div className="text-[10.5px] text-muted mt-1 flex items-center gap-1.5"><span className={cx("w-1.5 h-1.5 rounded-full", policy.agentOn ? "bg-green" : "bg-muted-2")} />{policy.agentOn ? "acting · grounded in the ledger" : "monitor only · grounded in the ledger"}</div>
        </div>
        <button type="button" onClick={() => setChatOpen(false)} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center hover:bg-tile"><Icon name="x" size={15} /></button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto scroll-thin px-3 py-3 space-y-2.5">
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[86%] rounded-2xl px-3 py-2 text-[11.5px] leading-relaxed fade-in", m.role === "user" ? "bg-ink text-white rounded-br-md" : "bg-tile text-ink-2 rounded-bl-md")}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scroll-thin">
        {SUGGESTED.map((s) => (
          <button key={s} type="button" onClick={() => ask(s)} className="shrink-0 h-7 px-2.5 rounded-full border border-line text-[10.5px] hover:bg-tile whitespace-nowrap">{s}</button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3 pt-1 flex items-center gap-2 border-t border-line">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask why…" className="flex-1 h-9 rounded-full bg-tile px-3.5 text-[12px] outline-none focus:ring-2 focus:ring-ink/10" />
        <button type="submit" aria-label="Send" className="w-9 h-9 rounded-full bg-ink text-white grid place-items-center hover:opacity-90"><Icon name="send" size={14} /></button>
      </form>
    </div>
  );
}
