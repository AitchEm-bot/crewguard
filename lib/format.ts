import type { Level } from "./sim";
import { fToC } from "./weather";
import type { Units } from "./store";

export const LEVEL_COLOR: Record<Level, string> = {
  GREEN: "#4FB07A",
  YELLOW: "#F2B233",
  ORANGE: "#F0812E",
  RED: "#E5484D",
};

export function fmtTemp(f: number, units: Units, digits = 0): string {
  return units === "F" ? `${f.toFixed(digits)}°F` : `${fToC(f).toFixed(digits)}°C`;
}
export function fmtTempC(c: number, units: Units, digits = 1): string {
  return units === "C" ? `${c.toFixed(digits)}°C` : `${((c * 9) / 5 + 32).toFixed(digits)}°F`;
}
export const fmtStrain = (s: number) => (s >= 119.5 ? "120+" : s.toFixed(0));

export const TYPE_LABEL: Record<string, string> = {
  GENESIS: "Genesis", ADVISORY: "Advisory", RESEQUENCE: "Resequence", NOTIFY: "Notify",
  REROUTE: "Reroute", RECOVERY: "Recovery", BREACH: "Breach", BREAK: "Break", COMPLETE: "Complete", SHIFT_END: "Shift end",
};
export const TYPE_TONE: Record<string, "ink" | "amber" | "green" | "red" | "muted"> = {
  GENESIS: "muted", ADVISORY: "amber", RESEQUENCE: "ink", NOTIFY: "amber", REROUTE: "ink",
  RECOVERY: "green", BREACH: "red", BREAK: "muted", COMPLETE: "green", SHIFT_END: "muted",
};
export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
