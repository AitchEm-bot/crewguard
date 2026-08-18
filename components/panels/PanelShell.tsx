"use client";
import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { cx } from "../ui/primitives";

export function PanelShell({ title, subtitle, onClose, children, width = 380, actions, className = "" }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; width?: number; actions?: ReactNode; className?: string }) {
  return (
    <div
      className={cx("h-full rounded-[22px] bg-white/92 backdrop-blur-xl shadow-[var(--shadow)] border border-white/70 flex flex-col overflow-hidden slide-in", className)}
      style={{ width, maxWidth: "calc(100vw - 120px)" }}
    >
      <div className="px-4 pt-4 pb-3 flex items-start gap-3 border-b border-line">
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold tracking-tight leading-none">{title}</h2>
          {subtitle && <div className="text-[11px] text-muted mt-1.5 leading-snug">{subtitle}</div>}
        </div>
        {actions}
        <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center hover:bg-tile text-ink-2 shrink-0">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">{children}</div>
    </div>
  );
}
