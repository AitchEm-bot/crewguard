// Synthetic 20 m temperature grid over downtown Phoenix, modelled on the
// structure of FortyGuard's hourly product: a city-wide base curve plus a
// street-scale anomaly field (asphalt corridors hot, parks/shade cool).
// Swap `SyntheticGridProvider` for a FortyGuard tOS-backed provider in
// lib/provider.ts to drive the same UI from real captures.
import { fbm } from "./noise";

export type LngLat = [number, number];

export const CITY = { name: "Phoenix, AZ", tz: "America/Phoenix" };

/** Grid bounds (downtown + midtown Phoenix). */
export const GRID = {
  west: -112.105,
  east: -112.04,
  south: 33.428,
  north: 33.482,
  cellM: 20,
};

const LAT0 = (GRID.south + GRID.north) / 2;
export const M_PER_DEG_LAT = 110_574;
export const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

export const COLS = Math.round(((GRID.east - GRID.west) * M_PER_DEG_LON) / GRID.cellM);
export const ROWS = Math.round(((GRID.north - GRID.south) * M_PER_DEG_LAT) / GRID.cellM);

export function toXY(p: LngLat): [number, number] {
  return [(p[0] - GRID.west) * M_PER_DEG_LON, (p[1] - GRID.south) * M_PER_DEG_LAT];
}
export function fromXY(x: number, y: number): LngLat {
  return [GRID.west + x / M_PER_DEG_LON, GRID.south + y / M_PER_DEG_LAT];
}
export function distM(a: LngLat, b: LngLat): number {
  const dx = (a[0] - b[0]) * M_PER_DEG_LON;
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

// --- Street naming helpers (downtown Phoenix grid) ------------------------
const CENTRAL = -112.074;
const DEG_PER_BLOCK_LON = 0.001238; // numbered streets/avenues ~1/14 mile apart
const EW_STREETS: [number, string][] = [
  [33.4421, "Sherman St"], [33.443, "Grant St"], [33.4439, "Lincoln St"], [33.4448, "Buchanan St"],
  [33.4457, "Jackson St"], [33.4466, "Madison St"], [33.4475, "Jefferson St"], [33.4484, "Washington St"],
  [33.4493, "Adams St"], [33.4502, "Monroe St"], [33.4514, "Van Buren St"], [33.4526, "Polk St"],
  [33.4538, "Taylor St"], [33.455, "Fillmore St"], [33.4562, "Pierce St"], [33.4574, "Garfield St"],
  [33.4587, "Roosevelt St"], [33.46, "Portland St"], [33.4612, "Moreland St"], [33.4626, "Culver St"],
  [33.4642, "Willetta St"], [33.4658, "McDowell Rd"], [33.4676, "Lynwood St"], [33.4694, "Palm Ln"],
  [33.4712, "Almeria Rd"], [33.4731, "Encanto Blvd"], [33.4749, "Coronado Rd"], [33.4767, "Virginia Ave"],
  [33.4785, "Monte Vista Rd"], [33.4804, "Thomas Rd"],
];
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export function nearestCross(p: LngLat): string {
  const off = Math.round((p[0] - CENTRAL) / DEG_PER_BLOCK_LON);
  const ns = off === 0 ? "N Central Ave" : off > 0 ? `N ${ordinal(off)} St` : `N ${ordinal(-off)} Ave`;
  let best = EW_STREETS[0];
  for (const s of EW_STREETS) if (Math.abs(s[0] - p[1]) < Math.abs(best[0] - p[1])) best = s;
  const ew = `${p[0] > CENTRAL ? "E" : "W"} ${best[1]}`;
  return `${ns} & ${ew}`;
}

// --- Features that shape the anomaly field --------------------------------
type Seg = { a: LngLat; b: LngLat; w: number; width: number };
const ROADS: Seg[] = [
  // freeways
  { a: [-112.105, 33.4612], b: [-112.062, 33.4612], w: 0.8, width: 130 }, // I-10 (west of deck park)
  { a: [-112.062, 33.4612], b: [-112.04, 33.462], w: 0.8, width: 130 },
  { a: [-112.045, 33.428], b: [-112.045, 33.482], w: 0.7, width: 110 }, // SR-51 / 16th St corridor
  { a: [-112.105, 33.434], b: [-112.04, 33.434], w: 0.75, width: 120 }, // I-17 south segment
  // arterials
  { a: [CENTRAL, 33.428], b: [CENTRAL, 33.482], w: 0.26, width: 82 }, // Central Ave
  { a: [-112.0653, 33.428], b: [-112.0653, 33.482], w: 0.29, width: 82 }, // 7th St
  { a: [-112.0827, 33.428], b: [-112.0827, 33.482], w: 0.29, width: 82 }, // 7th Ave
  { a: [-112.0975, 33.428], b: [-112.0975, 33.482], w: 0.24, width: 75 }, // 19th Ave
  { a: [-112.0542, 33.428], b: [-112.0542, 33.482], w: 0.24, width: 75 }, // 16th St
  { a: [-112.105, 33.4514], b: [-112.04, 33.4514], w: 0.29, width: 82 }, // Van Buren
  { a: [-112.105, 33.4484], b: [-112.04, 33.4484], w: 0.26, width: 82 }, // Washington
  { a: [-112.105, 33.4475], b: [-112.04, 33.4475], w: 0.24, width: 75 }, // Jefferson
  { a: [-112.105, 33.4658], b: [-112.04, 33.4658], w: 0.29, width: 82 }, // McDowell
  { a: [-112.105, 33.4804], b: [-112.04, 33.4804], w: 0.26, width: 82 }, // Thomas
  { a: [-112.078, 33.456], b: [-112.105, 33.479], w: 0.31, width: 90 }, // Grand Ave diagonal
  { a: [-112.105, 33.4587], b: [-112.04, 33.4587], w: 0.19, width: 60 }, // Roosevelt
];
type Blob = { c: LngLat; r: number; w: number };
const COOL: Blob[] = [
  { c: [-112.073, 33.4626], r: 260, w: 0.9 }, // Margaret T. Hance Park
  { c: [-112.0905, 33.4755], r: 520, w: 1.1 }, // Encanto Park
  { c: [-112.0745, 33.4535], r: 100, w: 0.55 }, // Civic Space Park
  { c: [-112.0662, 33.4503], r: 90, w: 0.4 }, // Heritage Square
  { c: [-112.048, 33.4478], r: 170, w: 0.7 }, // Eastlake Park
  { c: [-112.094, 33.4484], r: 230, w: 0.6 }, // Capitol Mall lawns
  { c: [-112.077, 33.449], r: 70, w: 0.35 }, // Cesar Chavez Plaza
  { c: [-112.0585, 33.4525], r: 90, w: 0.4 }, // Verde Park
  { c: [-112.0705, 33.47], r: 120, w: 0.45 }, // tree-lined blocks
  { c: [-112.0862, 33.47], r: 150, w: 0.5 }, // Encanto-Palmcroft
];
const HOT: Blob[] = [
  { c: [-112.0667, 33.4453], r: 280, w: 0.75 }, // Chase Field + lots
  { c: [-112.0708, 33.4489], r: 160, w: 0.45 }, // Convention Center roofs
  { c: [-112.0605, 33.4425], r: 420, w: 0.6 }, // rail yards / warehouse district
  { c: [-112.0435, 33.4375], r: 500, w: 0.65 }, // Sky Harbor approach / industrial
  { c: [-112.0985, 33.4425], r: 350, w: 0.55 }, // industrial SW
  { c: [-112.079, 33.464], r: 220, w: 0.5 }, // I-10 / 7th Ave interchange
  { c: [-112.0518, 33.462], r: 200, w: 0.4 }, // big-box lots
];

function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / l2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

const roadsXY = ROADS.map((s) => ({ a: toXY(s.a), b: toXY(s.b), w: s.w, width: s.width }));
const coolXY = COOL.map((b) => ({ c: toXY(b.c), r: b.r, w: b.w }));
const hotXY = HOT.map((b) => ({ c: toXY(b.c), r: b.r, w: b.w }));

/** Time-invariant anomaly (roughly -1.5 .. +1.5, unitless). */
export function anomalyAtXY(x: number, y: number): number {
  let v = 0.55 * fbm(x / 520, y / 520, 3, 7) + 0.25 * fbm(x / 140, y / 140, 2, 31);
  for (const r of roadsXY) {
    const d = segDist([x, y], r.a, r.b);
    if (d < r.width * 3) v += r.w * Math.exp(-(d * d) / (r.width * r.width));
  }
  for (const b of hotXY) {
    const d = Math.hypot(x - b.c[0], y - b.c[1]);
    if (d < b.r * 2.2) v += b.w * Math.exp(-(d * d) / (b.r * b.r * 0.6));
  }
  for (const b of coolXY) {
    const d = Math.hypot(x - b.c[0], y - b.c[1]);
    if (d < b.r * 2.2) v -= b.w * Math.exp(-(d * d) / (b.r * b.r * 0.6));
  }
  return Math.max(-1.6, Math.min(1.6, v));
}

let anomalyField: Float32Array | null = null;
/** Cached per-cell anomaly for the whole grid (ROWS x COLS, row 0 = south). */
export function getAnomalyField(): Float32Array {
  if (anomalyField) return anomalyField;
  const f = new Float32Array(ROWS * COLS);
  for (let r = 0; r < ROWS; r++) {
    const y = (r + 0.5) * GRID.cellM;
    for (let c = 0; c < COLS; c++) {
      f[r * COLS + c] = anomalyAtXY((c + 0.5) * GRID.cellM, y);
    }
  }
  anomalyField = f;
  return f;
}

export function anomalyAt(p: LngLat): number {
  const [x, y] = toXY(p);
  const c = Math.floor(x / GRID.cellM), r = Math.floor(y / GRID.cellM);
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return anomalyAtXY(x, y);
  return getAnomalyField()[r * COLS + c];
}
