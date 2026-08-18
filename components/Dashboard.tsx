"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { StoreProvider, useStore } from "@/lib/store";
import { Rail } from "./Rail";
import { TopBar } from "./TopBar";
import { ReplayBar } from "./ReplayBar";
import { ActivityCard, FleetCard, WorkerCard } from "./cards";
import { AgentChat } from "./AgentChat";
import { FleetPanel } from "./panels/FleetPanel";
import { LedgerPanel } from "./panels/LedgerPanel";
import { PolicyPanel } from "./panels/PolicyPanel";
import { AboutPanel } from "./panels/AboutPanel";
import { Icon, Logo } from "./ui/Icon";
import { cx } from "./ui/primitives";

const MapView = dynamic(() => import("./MapView").then((m) => m.MapView), { ssr: false });
const LegendPill = dynamic(() => import("./MapView").then((m) => m.LegendPill), { ssr: false });

const CARDS_H = 236; // px — cards row height on tall screens (content can grow past this; the frame scrolls)

export function Dashboard() {
  return (
    <StoreProvider>
      <div className="h-full w-full p-3 sm:p-4">
        {/* the frame: soft glass gradient, not flat white (reference) */}
        <div className="cg-frame h-full w-full rounded-[28px] shadow-[0_30px_80px_-30px_rgba(20,50,50,.45)] flex overflow-hidden">
          <Rail />
          <Main />
        </div>
      </div>
    </StoreProvider>
  );
}

function Main() {
  const { panel, chatOpen, setChatOpen, ready, playing, setPlaying, setPanel, detailsHidden, setDetailsHidden } = useStore();

  // keyboard: space = play/pause, esc = close panel/chat, d = toggle details
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.code === "Space") { e.preventDefault(); setPlaying(!playing); }
      if (e.key === "Escape") { setPanel(null); setChatOpen(false); }
      if (e.key === "d" || e.key === "D") setDetailsHidden(!detailsHidden);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [playing, setPlaying, setPanel, setChatOpen, detailsHidden, setDetailsHidden]);

  return (
    // The main column scrolls if the viewport is short, so the cards are never clipped.
    <main className="relative flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden scroll-thin">
      {/* map section — fills the frame in focus mode, otherwise leaves room for the cards */}
      <section
        className="relative w-full transition-[height] duration-300"
        style={{ height: detailsHidden ? "100%" : `calc(100% - ${CARDS_H}px)`, minHeight: 440 }}
      >
        <MapView />
        {/* soft edges so the map melts into the frame like the reference */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 z-10 bg-gradient-to-r from-[rgba(240,246,241,.9)] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 z-10 bg-gradient-to-b from-transparent to-[rgba(238,245,240,.92)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10 bg-gradient-to-b from-[rgba(244,248,245,.7)] to-transparent" />

        <TopBar />

        {/* left slide-over panels */}
        {panel && (
          <div className="absolute left-3 z-30" style={{ top: 60, bottom: 64 }}>
            {panel === "fleet" && <FleetPanel />}
            {panel === "ledger" && <LedgerPanel />}
            {panel === "policy" && <PolicyPanel />}
            {panel === "about" && <AboutPanel />}
          </div>
        )}

        {/* bottom-left: replay + legend (always visible, also in focus mode) */}
        <div className="absolute left-3 bottom-3 z-20 flex items-center gap-2 flex-wrap max-w-[calc(100%-120px)]">
          <ReplayBar />
          <LegendPill />
        </div>

        {/* bottom-right: agent chat, bounded to the map section so it never overflows */}
        <div className="absolute right-3 top-[152px] bottom-3 z-40 flex flex-col items-end justify-end gap-2 pointer-events-none">
          {chatOpen && <div className="pointer-events-auto min-h-0 flex-shrink flex"><AgentChat /></div>}
          <button
            type="button"
            onClick={() => setChatOpen(!chatOpen)}
            title="Ask the agent"
            className={cx("pointer-events-auto w-11 h-11 rounded-full grid place-items-center shadow-[0_10px_24px_-8px_rgba(0,0,0,.6)] transition-all hover:scale-105 shrink-0", chatOpen ? "bg-amber text-ink" : "bg-ink text-white")}
          >
            <Icon name={chatOpen ? "x" : "help"} size={20} />
          </button>
        </div>

      </section>

      {/* bottom cards — in normal flow, so they can grow and the frame scrolls if needed */}
      {!detailsHidden && (
        <section className="px-3 pb-3 pt-1 grid gap-3 grid-cols-[minmax(300px,1.45fr)_minmax(190px,1fr)_minmax(200px,1fr)] fade-in" style={{ minHeight: CARDS_H - 4 }}>
          <WorkerCard />
          <ActivityCard />
          <FleetCard />
        </section>
      )}

      {!ready && (
        <div className="absolute inset-0 z-50 bg-white/70 backdrop-blur-sm grid place-items-center">
          <div className="flex flex-col items-center gap-3 fade-in">
            <span className="w-12 h-12 rounded-full bg-ink text-white grid place-items-center animate-pulse"><Logo size={26} className="text-white" /></span>
            <div className="text-[13px] font-medium">Computing the shift replay…</div>
            <div className="text-[11px] text-muted">Both policy-on and policy-off runs, so the toggle is instant.</div>
          </div>
        </div>
      )}
    </main>
  );
}
