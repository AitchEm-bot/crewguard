"use client";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className = "", dark = false }: { children?: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[22px] shadow-[var(--shadow-soft)]",
        dark ? "bg-ink text-white" : "bg-white/78 backdrop-blur-xl border border-white/70 text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Black floating stat pill (reference: "15 House Number"). */
export function StatPill({ value, label, tone = "ink", className = "" }: { value: ReactNode; label: string; tone?: "ink" | "amber" | "red" | "green"; className?: string }) {
  const bg = tone === "amber" ? "bg-amber text-ink" : tone === "red" ? "bg-red text-white" : tone === "green" ? "bg-green text-white" : "bg-ink text-white";
  return (
    <div className={cx("rounded-[16px] px-3.5 py-2 min-w-[74px] text-center shadow-[0_8px_20px_-8px_rgba(0,0,0,.45)]", bg, className)}>
      <div className="text-[19px] font-semibold leading-tight tracking-tight tabular-nums">{value}</div>
      <div className={cx("text-[9.5px] leading-tight mt-0.5 font-medium", tone === "amber" ? "text-ink/70" : "text-white/70")}>{label}</div>
    </div>
  );
}

export function StatTile({ icon, label, value, sub, accent }: { icon: IconName; label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-[16px] bg-tile px-3 xl:px-3.5 pt-3 pb-3 flex flex-col min-h-[92px]">
      <div className="w-8 h-8 rounded-full bg-white grid place-items-center text-ink-2 shadow-[0_1px_3px_rgba(0,0,0,.08)]" style={accent ? { color: accent } : undefined}>
        <Icon name={icon} size={16} />
      </div>
      <div className="mt-auto pt-2">
        <div className="text-[10.5px] text-muted leading-none whitespace-nowrap">{label}</div>
        <div className="text-[24px] font-semibold leading-tight tracking-tight tabular-nums mt-1 flex items-baseline gap-1.5">
          {value}
          {sub && <span className="text-[11px] font-medium text-muted tracking-normal">{sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function Chip({ children, tone = "muted", className = "" }: { children: ReactNode; tone?: "ink" | "amber" | "green" | "red" | "muted" | "outline"; className?: string }) {
  const cls = {
    ink: "bg-ink text-white",
    amber: "bg-amber/20 text-[#8a5a00]",
    green: "bg-green/15 text-[#1f7a48]",
    red: "bg-red/12 text-[#b3262c]",
    muted: "bg-tile text-muted",
    outline: "border border-line text-ink-2",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide leading-none", cls, className)}>{children}</span>;
}

export function IconButton({ icon, onClick, active = false, label, size = 40, dark = false, className = "" }: { icon: IconName; onClick?: () => void; active?: boolean; label: string; size?: number; dark?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{ width: size, height: size }}
      className={cx(
        "grid place-items-center rounded-full transition-all duration-200",
        dark
          ? "bg-ink text-white shadow-[0_8px_18px_-8px_rgba(0,0,0,.6)] hover:scale-105"
          : active
            ? "bg-ink text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,.5)]"
            : "bg-white text-ink-2 border border-line hover:bg-tile",
        className,
      )}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </button>
  );
}

export function Toggle({ on, onChange, labelOn = "ON", labelOff = "OFF" }: { on: boolean; onChange: (v: boolean) => void; labelOn?: string; labelOff?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx("relative inline-flex items-center h-7 w-[58px] rounded-full transition-colors duration-200", on ? "bg-green" : "bg-tile-2")}
    >
      <span className={cx("absolute text-[9px] font-bold tracking-wide", on ? "left-2 text-white" : "right-2 text-muted")}>{on ? labelOn : labelOff}</span>
      <span className={cx("absolute h-5 w-5 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-[34px]" : "translate-x-1")} />
    </button>
  );
}

export function Avatar({ initials, hue, size = 34, ring = false, className = "" }: { initials: string; hue: number; size?: number; ring?: boolean; className?: string }) {
  return (
    <div
      className={cx("rounded-full grid place-items-center font-semibold text-white select-none", ring && "ring-2 ring-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${hue} 55% 55%), hsl(${hue + 25} 60% 40%))` }}
    >
      {initials}
    </div>
  );
}

/** Semicircle gauge (reference: thick amber arc, big value + label centred beneath). */
export function Gauge({ value, max = 100, color = "var(--amber)", size = 172, children }: { value: number; max?: number; color?: string; size?: number; children?: ReactNode }) {
  const W = 172, H = 100, r = 70, cx0 = W / 2, cy0 = 88, sw = 15;
  const pct = Math.max(0, Math.min(1, value / max));
  const arc = (p: number) => {
    const a = Math.PI * (1 - p);
    return [cx0 + r * Math.cos(a), cy0 - r * Math.sin(a)];
  };
  const [ex, ey] = arc(pct);
  const scale = size / W;
  return (
    <div className="relative" style={{ width: size, height: H * scale }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={size} height={H * scale} className="overflow-visible">
        <path d={`M ${cx0 - r} ${cy0} A ${r} ${r} 0 0 1 ${cx0 + r} ${cy0}`} fill="none" stroke="var(--tile-2)" strokeWidth={sw} strokeLinecap="round" />
        {pct > 0.004 && (
          // a half-circle gauge never sweeps more than 180°, so the large-arc flag stays 0
          <path d={`M ${cx0 - r} ${cy0} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" style={{ transition: "stroke .4s ease" }} />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center leading-none">{children}</div>
    </div>
  );
}
