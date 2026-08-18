// Rasterises the 20 m grid for a given minute into a PNG data URL that MapLibre
// draws as an image source (linear resampling gives the soft "heat blob" look).
import { COLS, ROWS, getAnomalyField } from "./geo";
import { anomalyAmpC, baseTempC, cToF, heatIndexF, humidity, getReplayDay } from "./weather";

export type HeatLayerMode = "relative" | "heatindex" | "off";

type RGBA = [number, number, number, number];
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mix(c1: RGBA, c2: RGBA, t: number): RGBA {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), lerp(c1[3], c2[3], t)];
}
/** Piecewise-linear ramp over [stop, color] pairs. */
function ramp(stops: [number, RGBA][], v: number): RGBA {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
      return mix(stops[i - 1][1], stops[i][1], t);
    }
  }
  return stops[stops.length - 1][1];
}

// deviation from the hourly city mean, °C → colour (reference-style soft blobs)
const RELATIVE: [number, RGBA][] = [
  [-3.0, [64, 150, 168, 150]],
  [-1.6, [96, 178, 178, 110]],
  [-0.8, [150, 205, 195, 45]],
  [-0.3, [200, 220, 210, 0]],
  [0.6, [250, 225, 120, 0]],
  [1.1, [250, 210, 90, 105]],
  [1.9, [244, 160, 60, 150]],
  [2.9, [232, 100, 52, 172]],
  [4.0, [206, 58, 48, 190]],
];
// absolute NWS heat index °F → colour
const HEATINDEX: [number, RGBA][] = [
  [80, [255, 235, 140, 0]],
  [90, [252, 214, 100, 110]],
  [100, [246, 168, 70, 150]],
  [106, [238, 120, 56, 180]],
  [112, [225, 74, 52, 200]],
  [120, [176, 40, 88, 220]],
  [128, [110, 30, 110, 235]],
];

const FEATHER = 14;
const cache = new Map<string, string>();
let canvas: HTMLCanvasElement | null = null;
let blurCanvas: HTMLCanvasElement | null = null;

export function heatImageForMinute(minuteOfDay: number, mode: HeatLayerMode): string | null {
  if (mode === "off" || typeof document === "undefined") return null;
  // hourly buckets, but interpolate the mean so blobs shift smoothly through the day
  const bucket = Math.floor(minuteOfDay / 15) * 15; // 15-min buckets
  const key = `${getReplayDay().iso}:${mode}:${bucket}`;
  const hit = cache.get(key);
  if (hit) return hit;

  if (!canvas) canvas = document.createElement("canvas");
  canvas.width = COLS; canvas.height = ROWS;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(COLS, ROWS);
  const field = getAnomalyField();
  const amp = anomalyAmpC(bucket);
  const base = baseTempC(bucket);
  const rh = humidity(bucket);
  const data = img.data;
  for (let r = 0; r < ROWS; r++) {
    const y = ROWS - 1 - r; // canvas top row = north
    for (let c = 0; c < COLS; c++) {
      const a = field[r * COLS + c];
      let col: RGBA;
      if (mode === "relative") col = ramp(RELATIVE, amp * a);
      else col = ramp(HEATINDEX, heatIndexF(cToF(base + amp * a), rh));
      const i = (y * COLS + c) * 4;
      // feather the outer ~14 cells so the grid boundary fades instead of ending in a hard edge
      const edge = Math.min(c, COLS - 1 - c, r, ROWS - 1 - r);
      const feather = edge < FEATHER ? edge / FEATHER : 1;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = col[3] * feather;
    }
  }
  ctx.putImageData(img, 0, 0);
  // soften into blobs: draw through a slight blur onto a second canvas
  if (!blurCanvas) blurCanvas = document.createElement("canvas");
  blurCanvas.width = COLS; blurCanvas.height = ROWS;
  const bctx = blurCanvas.getContext("2d")!;
  bctx.clearRect(0, 0, COLS, ROWS);
  bctx.filter = "blur(2.2px)";
  bctx.drawImage(canvas, 0, 0);
  bctx.filter = "none";
  const url = blurCanvas.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

/** Legend stops for the UI. */
export function legendFor(mode: HeatLayerMode, minuteOfDay: number): { label: string; stops: { t: number; color: string }[]; min: string; max: string } {
  const toCss = (c: RGBA) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0.15, c[3] / 255).toFixed(2)})`;
  if (mode === "heatindex") {
    return {
      label: "Heat index",
      stops: [90, 100, 106, 112, 120, 128].map((v, i, arr) => ({ t: i / (arr.length - 1), color: toCss(ramp(HEATINDEX, v)) })),
      min: "90°F", max: "128°F",
    };
  }
  const amp = anomalyAmpC(minuteOfDay);
  return {
    label: "vs city mean",
    stops: [-3, -1.6, -0.7, 0, 1, 1.8, 2.8, 4].map((v, i, arr) => ({ t: i / (arr.length - 1), color: toCss(ramp(RELATIVE, v)) })),
    min: `−${(1.6 * amp).toFixed(1)}°C`, max: `+${(1.6 * amp).toFixed(1)}°C`,
  };
}
