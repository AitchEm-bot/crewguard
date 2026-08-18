// City-wide base weather for the replayed day (Phoenix, 15 Jul 2023 — inside
// the record 31-day streak of 110°F+ highs; NWS Excessive Heat Warning in effect)
// plus the heat-index calculation shared by the grid and the strain model.
import { anomalyAt, type LngLat } from "./geo";

export const DEFAULT_DAY = "2023-07-15";
/** @deprecated use getReplayDay() — kept for older imports */
export const REPLAY_DATE = DEFAULT_DAY;
export const SHIFT_START_MIN = 7 * 60; // 07:00
export const SHIFT_END_MIN = 18 * 60; // 18:00
export const TICKS = SHIFT_END_MIN - SHIFT_START_MIN; // 1 tick = 1 minute

// hour -> air temperature (°C, 2 m) city mean, hourly
const BASE_C: Record<number, number> = {
  5: 33.0, 6: 33.4, 7: 34.6, 8: 36.7, 9: 38.8, 10: 40.7, 11: 42.2, 12: 43.5, 13: 44.6,
  14: 45.4, 15: 46.0, 16: 46.3, 17: 46.0, 18: 45.2, 19: 43.9, 20: 42.2, 21: 40.9,
};
// hour -> relative humidity (%)
const RH: Record<number, number> = {
  5: 24, 6: 23, 7: 21, 8: 19, 9: 17, 10: 15, 11: 13, 12: 12, 13: 11, 14: 10, 15: 10,
  16: 9, 17: 10, 18: 11, 19: 12, 20: 14, 21: 15,
};
// hour -> spatial anomaly amplitude (°C per unit anomaly). Peaks with solar load.
const AMP_C: Record<number, number> = {
  5: 1.1, 6: 1.1, 7: 1.3, 8: 1.6, 9: 1.9, 10: 2.2, 11: 2.4, 12: 2.6, 13: 2.75,
  14: 2.85, 15: 2.9, 16: 2.85, 17: 2.7, 18: 2.5, 19: 2.3, 20: 2.1, 21: 2.0,
};

// --- Archive: July 2023 Phoenix daily highs (°F, approx. NWS Sky Harbor) ---
// The 31-day 110°F+ streak ran 30 Jun – 30 Jul; 19–20 and 25 Jul reached 119°F.
export const ARCHIVE_MONTH = { year: 2023, month: 7 };
export const DAY_HIGHS_F: Record<number, number> = {
  1: 110, 2: 111, 3: 112, 4: 111, 5: 110, 6: 111, 7: 111, 8: 112, 9: 113, 10: 113,
  11: 114, 12: 115, 13: 116, 14: 116, 15: 116, 16: 117, 17: 116, 18: 118, 19: 119, 20: 119,
  21: 115, 22: 116, 23: 115, 24: 116, 25: 119, 26: 117, 27: 116, 28: 116, 29: 116, 30: 116, 31: 108,
};
const REFERENCE_HIGH_F = 116; // BASE_C peaks at 46.3 °C ≈ 115–116 °F

export interface DayInfo { iso: string; day: number; highF: number; advisory: "Excessive Heat Warning" | "Heat Advisory" | "None"; deltaC: number }
export function dayInfo(iso: string): DayInfo {
  const day = Number(iso.slice(8, 10));
  const highF = DAY_HIGHS_F[day] ?? REFERENCE_HIGH_F;
  const advisory = highF >= 110 ? "Excessive Heat Warning" : highF >= 105 ? "Heat Advisory" : "None";
  return { iso, day, highF, advisory, deltaC: ((highF - REFERENCE_HIGH_F) * 5) / 9 };
}
export const isoForDay = (day: number) => `${ARCHIVE_MONTH.year}-${String(ARCHIVE_MONTH.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Module-level replay day: the whole simulation is synchronous and single-day,
// so every consumer (sim, raster, chat) reads the same shifted curve.
let replayDay: DayInfo = dayInfo(DEFAULT_DAY);
export function setReplayDay(iso: string) { replayDay = dayInfo(iso); }
export function getReplayDay(): DayInfo { return replayDay; }

function interpHourly(table: Record<number, number>, minuteOfDay: number): number {
  const h = Math.floor(minuteOfDay / 60);
  const t = (minuteOfDay - h * 60) / 60;
  const a = table[Math.max(5, Math.min(21, h))];
  const b = table[Math.max(5, Math.min(21, h + 1))];
  const s = t * t * (3 - 2 * t); // smoothstep for gentle hourly transitions
  return a + (b - a) * s;
}

export const baseTempC = (minuteOfDay: number) => interpHourly(BASE_C, minuteOfDay) + replayDay.deltaC;
export const humidity = (minuteOfDay: number) => interpHourly(RH, minuteOfDay);
export const anomalyAmpC = (minuteOfDay: number) => interpHourly(AMP_C, minuteOfDay);

export const cToF = (c: number) => (c * 9) / 5 + 32;
export const fToC = (f: number) => ((f - 32) * 5) / 9;

/** NWS (Rothfusz) heat index in °F from air temp °F and RH %. */
export function heatIndexF(tF: number, rh: number): number {
  if (tF < 80) return tF;
  const T = tF, R = rh;
  let hi =
    -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R -
    6.83783e-3 * T * T - 5.481717e-2 * R * R + 1.22874e-3 * T * T * R +
    8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  } else if (R > 85 && T >= 80 && T <= 87) {
    hi += ((R - 85) / 10) * ((87 - T) / 5);
  }
  // In very dry, very hot air the polynomial can dip below air temp; NWS
  // guidance treats HI ≈ T there. Clamp so HI never reads below the air temp.
  return Math.max(hi, tF);
}

/** Air temperature (°C) in a specific 20 m cell at a given minute of day. */
export function tempAtC(p: LngLat, minuteOfDay: number): number {
  return baseTempC(minuteOfDay) + anomalyAmpC(minuteOfDay) * anomalyAt(p);
}

/** Heat index (°F) in a specific cell at a given minute of day. */
export function heatIndexAtF(p: LngLat, minuteOfDay: number): number {
  return heatIndexF(cToF(tempAtC(p, minuteOfDay)), humidity(minuteOfDay));
}

export const minuteToClock = (minuteOfDay: number) => {
  const m = Math.round(minuteOfDay);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** NWS heat index category. */
export function hiCategory(hiF: number): { key: string; label: string } {
  if (hiF >= 125) return { key: "extreme", label: "Extreme danger" };
  if (hiF >= 103) return { key: "danger", label: "Danger" };
  if (hiF >= 90) return { key: "caution2", label: "Extreme caution" };
  if (hiF >= 80) return { key: "caution", label: "Caution" };
  return { key: "ok", label: "Normal" };
}
