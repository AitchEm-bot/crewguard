"use client";
// Chip-style pickers (reference: "Insurance Type ▾ · State ▾ · City ▾"): menus render in a
// body portal with fixed positioning so they are never clipped by scroll/overflow parents.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { cx } from "./primitives";

// ---------------------------------------------------------------- popover ---
export function usePopover() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const r = anchorRef.current!.getBoundingClientRect();
      const width = popRef.current?.offsetWidth ?? 240;
      const left = Math.min(r.left, window.innerWidth - width - 12);
      setPos({ top: r.bottom + 6, left: Math.max(12, left), minWidth: r.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return { open, setOpen, anchorRef, popRef, pos };
}

export function ChipTrigger({ label, value, open, onClick, minWidth = 120, anchorRef, icon }: { label: string; value: ReactNode; open: boolean; onClick: () => void; minWidth?: number; anchorRef: React.RefObject<HTMLButtonElement | null>; icon?: ReactNode }) {
  return (
    <button
      ref={anchorRef}
      type="button"
      onClick={onClick}
      style={{ minWidth }}
      className={cx("h-9 rounded-full bg-white/90 backdrop-blur border border-line pl-3 pr-2 flex items-center justify-between gap-2 text-[11.5px] hover:bg-white transition-colors shadow-[var(--shadow-soft)]", open && "ring-2 ring-ink/10 bg-white")}
    >
      <span className="flex items-center gap-1.5 truncate">
        {icon}
        <span className="text-muted">{label}</span>
        <span className="text-muted-2">·</span>
        <span className="font-medium truncate">{value}</span>
      </span>
      <Icon name="chevron" size={14} className={cx("text-muted transition-transform shrink-0", open && "rotate-180")} />
    </button>
  );
}

export function PopoverPanel({ open, pos, popRef, children, width }: { open: boolean; pos: { top: number; left: number; minWidth: number } | null; popRef: React.RefObject<HTMLDivElement | null>; children: ReactNode; width?: number }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={popRef}
      style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, minWidth: pos?.minWidth, width, zIndex: 1000 }}
      className="rounded-2xl bg-white/95 backdrop-blur-xl border border-white/70 shadow-[var(--shadow)] p-1.5 pop-in"
    >
      {children}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------ select chip ---
export interface SelectOption<T extends string> { value: T; label: string; hint?: string; leading?: ReactNode }

export function SelectChip<T extends string>({ label, value, options, onChange, minWidth = 130, width = 250, icon }: { label: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; minWidth?: number; width?: number; icon?: ReactNode }) {
  const p = usePopover();
  const current = options.find((o) => o.value === value);
  return (
    <>
      <ChipTrigger label={label} value={current?.label} open={p.open} onClick={() => p.setOpen(!p.open)} minWidth={minWidth} anchorRef={p.anchorRef} icon={icon} />
      <PopoverPanel open={p.open} pos={p.pos} popRef={p.popRef} width={width}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => { onChange(o.value); p.setOpen(false); }}
            className={cx("w-full text-left rounded-xl px-2.5 py-2 text-[12px] hover:bg-tile flex items-center gap-3", o.value === value && "bg-tile")}
          >
            {o.leading && <span className="shrink-0">{o.leading}</span>}
            <span className="min-w-0 flex-1">
              <span className={cx("block truncate", o.value === value && "font-medium")}>{o.label}</span>
              {o.hint && <span className="block text-[10.5px] text-muted font-normal truncate">{o.hint}</span>}
            </span>
            {o.value === value && <Icon name="check" size={14} className="shrink-0" />}
          </button>
        ))}
      </PopoverPanel>
    </>
  );
}

// ---------------------------------------------------------- calendar chip ---
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarChip({ label = "Day", value, year, month, onChange, dayMeta, footer }: {
  label?: string;
  value: string; // ISO
  year: number; month: number; // 1-based
  onChange: (iso: string) => void;
  /** per-day decoration: colour dot + tooltip */
  dayMeta?: (day: number) => { dot?: string; title?: string; disabled?: boolean } | undefined;
  footer?: ReactNode;
}) {
  const p = usePopover();
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday-first
  const selectedDay = value.startsWith(`${year}-${String(month).padStart(2, "0")}`) ? Number(value.slice(8, 10)) : -1;
  const pretty = new Date(value + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      <ChipTrigger label={label} value={pretty} open={p.open} onClick={() => p.setOpen(!p.open)} minWidth={150} anchorRef={p.anchorRef} icon={<Icon name="clock" size={13} className="text-muted" />} />
      <PopoverPanel open={p.open} pos={p.pos} popRef={p.popRef} width={272}>
        <div className="px-2 pt-2 pb-1 flex items-center justify-between">
          <div>
            <div className="text-[12.5px] font-semibold leading-none">{MONTHS[month - 1]} {year}</div>
            <div className="text-[10px] text-muted mt-1">Archive replay · one shift per day</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-7 h-7 rounded-full grid place-items-center text-muted-2 border border-line/70 cursor-not-allowed" title="Only July 2023 is in the demo archive"><Icon name="chevron" size={13} className="rotate-90" /></span>
            <span className="w-7 h-7 rounded-full grid place-items-center text-muted-2 border border-line/70 cursor-not-allowed" title="Only July 2023 is in the demo archive"><Icon name="chevron" size={13} className="-rotate-90" /></span>
          </div>
        </div>
        <div className="grid grid-cols-7 px-1.5 mt-1">
          {WEEKDAYS.map((d) => <div key={d} className="text-center text-[9.5px] text-muted-2 font-medium py-1">{d}</div>)}
          {cells.map((d, i) => {
            if (d == null) return <div key={`e${i}`} />;
            const meta = dayMeta?.(d);
            const sel = d === selectedDay;
            const iso = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            return (
              <button
                key={d}
                type="button"
                disabled={meta?.disabled}
                title={meta?.title}
                onClick={() => { onChange(iso); p.setOpen(false); }}
                className={cx(
                  "relative h-8 m-[1px] rounded-full text-[11.5px] tabular-nums grid place-items-center transition-colors",
                  sel ? "bg-ink text-white font-semibold" : meta?.disabled ? "text-muted-2 cursor-not-allowed" : "hover:bg-tile text-ink",
                )}
              >
                {d}
                {meta?.dot && <span className={cx("absolute bottom-[3px] w-1 h-1 rounded-full", sel && "ring-1 ring-white")} style={{ background: meta.dot }} />}
              </button>
            );
          })}
        </div>
        {footer && <div className="px-2 pt-2 pb-1 border-t border-line/70 mt-1">{footer}</div>}
      </PopoverPanel>
    </>
  );
}
