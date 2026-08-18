"use client";
import { useStore, type Panel } from "@/lib/store";
import { Icon, Logo, type IconName } from "./ui/Icon";
import { cx } from "./ui/primitives";

const NAV: { key: Panel; icon: IconName; label: string }[] = [
  { key: null, icon: "home", label: "Live map" },
  { key: "fleet", icon: "users", label: "Crew" },
  { key: "ledger", icon: "file", label: "Decision ledger" },
  { key: "policy", icon: "sliders", label: "Policy" },
];

export function Rail() {
  const { panel, setPanel, setChatOpen, units, setUnits } = useStore();
  return (
    <aside className="w-[68px] shrink-0 h-full flex flex-col items-center py-4 select-none">
      <button type="button" onClick={() => setPanel(null)} className="text-ink hover:opacity-80 transition-opacity" title="CrewGuard">
        <Logo size={34} />
      </button>

      {/* main nav sits in the vertical middle of the rail (reference), tools at the bottom */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-3">
        {NAV.map((n) => {
          const active = panel === n.key;
          return (
            <button
              key={n.label}
              type="button"
              title={n.label}
              aria-label={n.label}
              onClick={() => { setPanel(active && n.key !== null ? null : n.key); if (n.key === null) setChatOpen(false); }}
              className={cx(
                "w-10 h-10 rounded-full grid place-items-center transition-all duration-200",
                active ? "bg-ink text-white shadow-[0_8px_16px_-6px_rgba(0,0,0,.5)]" : "text-ink-2 hover:bg-white/70",
              )}
            >
              <span className={cx("grid place-items-center rounded-full", !active && "w-8 h-8 border border-ink/15")}>
                <Icon name={n.icon} size={16} />
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          title="Toggle °F / °C"
          onClick={() => setUnits(units === "F" ? "C" : "F")}
          className="w-10 h-10 rounded-full grid place-items-center text-ink-2 hover:bg-white/70 transition-colors"
        >
          <span className="w-8 h-8 rounded-full border border-ink/15 grid place-items-center text-[10.5px] font-semibold">°{units}</span>
        </button>
        <button
          type="button"
          title="About CrewGuard"
          onClick={() => setPanel(panel === "about" ? null : "about")}
          className={cx("w-10 h-10 rounded-full grid place-items-center transition-colors", panel === "about" ? "bg-ink text-white" : "text-ink-2 hover:bg-white/70")}
        >
          <span className={cx("grid place-items-center rounded-full", panel !== "about" && "w-8 h-8 border border-ink/15")}><Icon name="help" size={16} /></span>
        </button>
        <a
          href="https://fortyguard.com"
          target="_blank"
          rel="noreferrer"
          title="Powered by FortyGuard tOS"
          className="mt-1 w-10 h-10 rounded-full bg-ink text-white grid place-items-center shadow-[0_8px_16px_-6px_rgba(0,0,0,.5)] hover:scale-105 transition-transform"
        >
          <span className="text-[13px] font-bold tracking-tight">FG</span>
        </a>
      </div>
    </aside>
  );
}
