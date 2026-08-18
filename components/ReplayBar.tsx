"use client";
import { SPEEDS, useStore } from "@/lib/store";
import { TICKS, tickToClock } from "@/lib/sim";
import { Icon } from "./ui/Icon";
import { cx } from "./ui/primitives";

export function ReplayBar() {
  const { tick, setTick, playing, setPlaying, speed, setSpeed, restart, ready, day } = useStore();
  const pct = (tick / (TICKS - 1)) * 100;
  return (
    <div className="h-10 rounded-full bg-white/90 backdrop-blur border border-white/70 shadow-[var(--shadow-soft)] pl-1.5 pr-3 flex items-center gap-2 w-[420px] max-w-[52vw]">
      <button
        type="button"
        onClick={() => setPlaying(!playing)}
        disabled={!ready}
        aria-label={playing ? "Pause" : "Play"}
        className="w-7 h-7 rounded-full bg-ink text-white grid place-items-center hover:scale-105 transition-transform disabled:opacity-40"
      >
        <Icon name={playing ? "pause" : "play"} size={12} strokeWidth={2.4} />
      </button>
      <button type="button" onClick={restart} aria-label="Restart" className="w-7 h-7 rounded-full text-ink-2 grid place-items-center hover:bg-tile">
        <Icon name="restart" size={13} />
      </button>
      <div className="flex flex-col leading-none">
        <span className="text-[14px] font-semibold tabular-nums tracking-tight">{tickToClock(tick)}</span>
        <span className="text-[9px] text-muted">{day} · replay</span>
      </div>
      <div className="relative flex-1 h-6 flex items-center mx-1">
        <div className="absolute inset-x-0 h-1 rounded-full bg-tile-2" />
        <div className="absolute left-0 h-1 rounded-full bg-amber" style={{ width: `${pct}%` }} />
        {/* hour ticks */}
        {[8, 10, 12, 14, 16].map((h) => (
          <span key={h} className="absolute top-[18px] text-[8px] text-muted-2 -translate-x-1/2 tabular-nums" style={{ left: `${(((h - 7) * 60) / (TICKS - 1)) * 100}%` }}>{h}</span>
        ))}
        <input
          type="range"
          min={0}
          max={TICKS - 1}
          value={tick}
          onChange={(e) => setTick(Number(e.target.value))}
          className="cg-range amber absolute inset-x-0 w-full bg-transparent"
          style={{ background: "transparent" }}
          aria-label="Replay position"
        />
      </div>
      <div className="flex items-center rounded-full bg-tile p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={cx("px-1.5 h-6 rounded-full text-[10px] font-semibold tabular-nums transition-colors", speed === s ? "bg-ink text-white" : "text-muted hover:text-ink")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
