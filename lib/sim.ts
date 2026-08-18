// CrewGuard shift simulator. Runs each worker minute-by-minute through the
// heatwave day, estimates heat strain from the 20 m grid + workload, and lets
// the agent act (resequence, reroute, schedule recovery) before anyone crosses
// the safe limit. Every observation/decision is appended to a hash-chained
// ledger. Deterministic: same inputs → same run → same hashes.
import { anomalyAt, distM, nearestCross, type LngLat } from "./geo";
import { DEPOT, POIS, WORKERS, stopsFor, type Poi, type Stop, type Worker, type Workload } from "./fleet";
import { baseTempC, cToF, heatIndexF, humidity, SHIFT_END_MIN, SHIFT_START_MIN, TICKS, tempAtC, minuteToClock, getReplayDay, setReplayDay } from "./weather";
import { sha256Hex } from "./sha256";

// ---------------------------------------------------------------- policy ---
export interface Policy {
  agentOn: boolean;
  recoveryTrigger: number; // projected strain that triggers a recovery break
  horizonMin: number; // projection horizon
  breakMin: number; // recovery break length
  minGapMin: number; // minimum minutes between agent-scheduled recoveries
  poiRadiusM: number; // how far the agent will send someone for shade/AC
  resequence: boolean;
  reroute: boolean;
}
export const SAFE_LIMIT = 100; // strain index at which heat-illness risk is unacceptable
export const STRAIN_CAP = 120; // display/physiology cap ("off the chart")
export const DEFAULT_POLICY: Policy = {
  agentOn: true,
  recoveryTrigger: 68,
  horizonMin: 20,
  breakMin: 12,
  minGapMin: 25,
  poiRadiusM: 550,
  resequence: true,
  reroute: true,
};

// ---------------------------------------------------------------- types ----
export type Level = "GREEN" | "YELLOW" | "ORANGE" | "RED";
export type WorkerState = "TRAVELING" | "WORKING" | "RECOVERING" | "BREAK" | "DONE";
export type LedgerType =
  | "GENESIS" | "ADVISORY" | "RESEQUENCE" | "NOTIFY" | "REROUTE" | "RECOVERY"
  | "BREACH" | "BREAK" | "COMPLETE" | "SHIFT_END";

export interface WorkerTick {
  pos: LngLat;
  strain: number;
  level: Level;
  state: WorkerState;
  hiF: number; // heat index in the worker's cell
  tempC: number; // air temp in the worker's cell
  hiEffF: number; // what the body feels after sun/shade/AC adjustment
  stopsDone: number;
  legIndex: number; // index into WorkerRun.legs, -1 when stationary
  target: string; // human label of what they're doing
}

export interface Leg {
  path: LngLat[];
  kind: "stop" | "poi" | "depot";
  label: string;
  rerouted: boolean;
}

export interface LedgerEntry {
  seq: number;
  tick: number;
  time: string;
  actor: string; // "fleet" | workerId
  type: LedgerType;
  title: string;
  detail: string;
  data: Record<string, string | number | boolean | string[]>;
  prevHash: string;
  hash: string;
}

export interface WorkerRun {
  workerId: string;
  ticks: WorkerTick[];
  legs: Leg[];
  order: string[]; // final stop order (ids)
  peak: number;
  peakTick: number;
  breaches: number;
  recoveries: number;
  reroutes: number;
  stopsDone: number;
  totalStops: number;
  finishedTick: number | null;
  minutesRecovering: number;
}

export interface FleetRun {
  policy: Policy;
  workers: Record<string, WorkerRun>;
  ledger: LedgerEntry[];
  fleetPeak: number;
  totalBreaches: number;
  totalDecisions: number; // agent actions (resequence + reroute + recovery)
  stopsDone: number;
  totalStops: number;
}

// -------------------------------------------------------------- helpers ----
export function levelOf(strain: number): Level {
  if (strain >= 80) return "RED";
  if (strain >= 60) return "ORANGE";
  if (strain >= 40) return "YELLOW";
  return "GREEN";
}
const LEVEL_RANK: Record<Level, number> = { GREEN: 0, YELLOW: 1, ORANGE: 2, RED: 3 };
const LEVELS: Level[] = ["GREEN", "YELLOW", "ORANGE", "RED"];
const LEVEL_THRESHOLD: Record<Level, number> = { GREEN: 0, YELLOW: 40, ORANGE: 60, RED: 80 };

type Activity = "rest" | "light" | "moderate" | "heavy";
const WORK: Record<Activity, number> = { rest: 0.15, light: 0.6, moderate: 1.0, heavy: 1.4 };
type Exposure = "sun" | "cab" | "shade" | "ac";
const SUN_ADJ: Record<Exposure, number> = { sun: 3, cab: -2, shade: -6, ac: 0 };

interface Mobility { speed: number; travelActivity: Activity; travelExposure: Exposure }
function mobilityFor(w: Worker): Mobility {
  if (w.role.includes("e-bike")) return { speed: 200, travelActivity: "light", travelExposure: "sun" };
  if (w.role.includes("foot")) return { speed: 85, travelActivity: "moderate", travelExposure: "sun" };
  return { speed: 230, travelActivity: "light", travelExposure: "cab" };
}

/** Per-minute strain update. Returns new strain. */
export function stepStrain(strain: number, hiF: number, exposure: Exposure, activity: Activity, acclimatized: boolean): { strain: number; hiEffF: number } {
  const hiEffF = exposure === "ac" ? 78 : hiF + SUN_ADJ[exposure];
  const e = Math.max(0, Math.min(1.6, (hiEffF - 85) / 30));
  const acc = acclimatized ? 1 : 1.3;
  const gain = 0.85 * Math.pow(e, 1.6) * WORK[activity] * acc;
  const resting = activity === "rest";
  const loss = resting ? 2.6 * (1 - 0.5 * e) : 0.55 * (1 - 0.7 * e);
  const next = Math.max(0, Math.min(STRAIN_CAP, strain + gain - Math.max(0, loss)));
  return { strain: next, hiEffF };
}

function manhattanPath(from: LngLat, to: LngLat, lonFirst: boolean): LngLat[] {
  const mid: LngLat = lonFirst ? [to[0], from[1]] : [from[0], to[1]];
  return [from, mid, to];
}
function pathLength(path: LngLat[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += distM(path[i - 1], path[i]);
  return l;
}
function pointAlong(path: LngLat[], m: number): LngLat {
  let rem = m;
  for (let i = 1; i < path.length; i++) {
    const seg = distM(path[i - 1], path[i]);
    if (rem <= seg) {
      const t = seg === 0 ? 0 : rem / seg;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
    rem -= seg;
  }
  return path[path.length - 1];
}
/** Mean & max cell temperature along a path, sampled every 20 m. */
function pathHeat(path: LngLat[], minute: number): { mean: number; max: number; maxAt: LngLat } {
  const len = pathLength(path);
  const n = Math.max(2, Math.ceil(len / 20));
  let sum = 0, max = -Infinity, maxAt = path[0];
  for (let i = 0; i <= n; i++) {
    const p = pointAlong(path, (len * i) / n);
    const t = tempAtC(p, minute);
    sum += t;
    if (t > max) { max = t; maxAt = p; }
  }
  return { mean: sum / (n + 1), max, maxAt };
}

function nearestNeighborOrder(start: LngLat, stops: Stop[]): Stop[] {
  const left = [...stops];
  const out: Stop[] = [];
  let cur = start;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((s, i) => { const d = distM(cur, s.pos); if (d < bd) { bd = d; bi = i; } });
    const s = left.splice(bi, 1)[0];
    out.push(s);
    cur = s.pos;
  }
  return out;
}

// --------------------------------------------------------------- ledger ----
class Ledger {
  entries: LedgerEntry[] = [];
  private prev = "0".repeat(64);
  add(tick: number, actor: string, type: LedgerType, title: string, detail: string, data: LedgerEntry["data"] = {}) {
    const seq = this.entries.length;
    const time = minuteToClock(SHIFT_START_MIN + tick);
    const body = JSON.stringify({ seq, tick, time, actor, type, title, detail, data });
    const hash = sha256Hex(this.prev + body);
    this.entries.push({ seq, tick, time, actor, type, title, detail, data, prevHash: this.prev, hash });
    this.prev = hash;
  }
}
/** Recompute the chain; returns index of first broken link or -1 if intact. */
export function verifyLedger(entries: LedgerEntry[]): number {
  let prev = "0".repeat(64);
  for (const e of entries) {
    const body = JSON.stringify({ seq: e.seq, tick: e.tick, time: e.time, actor: e.actor, type: e.type, title: e.title, detail: e.detail, data: e.data });
    if (e.prevHash !== prev || sha256Hex(prev + body) !== e.hash) return e.seq;
    prev = e.hash;
  }
  return -1;
}

// ------------------------------------------------------- worker simulator --
interface PendingEvent { tick: number; actor: string; type: LedgerType; title: string; detail: string; data: LedgerEntry["data"] }

interface SimOptions { policy: Policy; order: Stop[]; events?: PendingEvent[]; }

const FIXED_BREAKS: { at: number; min: number; label: string }[] = [
  { at: 9 * 60 + 30, min: 10, label: "Scheduled break" },
  { at: 12 * 60, min: 30, label: "Lunch break" },
  { at: 15 * 60, min: 10, label: "Scheduled break" },
];

function simulateWorker(w: Worker, opts: SimOptions): WorkerRun {
  const { policy } = opts;
  const events = opts.events;
  const mob = mobilityFor(w);
  const acclim = w.acclimatized;
  const queue: Stop[] = [...opts.order];
  const legs: Leg[] = [];
  const ticks: WorkerTick[] = [];

  let pos: LngLat = DEPOT.pos;
  let strain = 12; // arriving from a warm morning commute
  let stopsDone = 0;
  let level: Level = "GREEN";
  let alertLevel: Level = "GREEN"; // last level we notified about (steps down with hysteresis)
  let peak = 0, peakTick = 0, breaches = 0, recoveries = 0, reroutes = 0, minutesRecovering = 0;
  let inBreach = false;
  let finishedTick: number | null = null;
  let lastRecoveryEnd = -Infinity;
  const fixedDone = new Set<number>();

  // phase machine
  type Phase =
    | { kind: "travel"; leg: number; progress: number; then: Phase }
    | { kind: "service"; stop: Stop; remaining: number }
    | { kind: "recover"; poi: Poi | null; remaining: number; label: string; resume: Phase; state: WorkerState }
    | { kind: "done" };
  let phase: Phase = { kind: "done" };

  const legTo = (target: LngLat, kind: Leg["kind"], label: string, minute: number): number => {
    const a = manhattanPath(pos, target, true);
    const b = manhattanPath(pos, target, false);
    let path = a, rerouted = false;
    if (policy.agentOn && policy.reroute && distM(pos, target) > 120) {
      const ha = pathHeat(a, minute), hb = pathHeat(b, minute);
      const hot = ha.max > baseTempC(minute) + 1.2; // hot corridor: well above city mean
      if (hot && hb.mean < ha.mean - 0.3) {
        path = b; rerouted = true; reroutes++;
        events?.push({
          tick: minute - SHIFT_START_MIN, actor: w.id, type: "REROUTE",
          title: `Rerouted around ${nearestCross(ha.maxAt)}`,
          detail: `Default leg crossed a hot corridor at ${ha.max.toFixed(1)} °C (${(ha.max - baseTempC(minute)).toFixed(1)} above city mean). Alternate leg is ${(ha.mean - hb.mean).toFixed(1)} °C cooler on average, same distance.`,
          data: { legTo: label, hotCorridor: nearestCross(ha.maxAt), hotC: +ha.max.toFixed(2), deltaMeanC: +(ha.mean - hb.mean).toFixed(2), distanceM: Math.round(pathLength(b)) },
        });
      }
    }
    legs.push({ path, kind, label, rerouted });
    return legs.length - 1;
  };

  const nextStopPhase = (minute: number): Phase => {
    const s = queue.shift();
    if (!s) return { kind: "done" };
    const leg = legTo(s.pos, "stop", s.label, minute);
    return { kind: "travel", leg, progress: 0, then: { kind: "service", stop: s, remaining: s.serviceMin } };
  };

  const projectedNet = (hiF: number, exposure: Exposure, activity: Activity) => {
    const s2 = stepStrain(strain, hiF, exposure, activity, acclim).strain;
    return s2 - strain;
  };

  for (let t = 0; t < TICKS; t++) {
    const minute = SHIFT_START_MIN + t;
    if (t === 0) phase = nextStopPhase(minute);

    // --- fixed breaks (both policies) --------------------------------------
    for (const fb of FIXED_BREAKS) {
      if (fixedDone.has(fb.at) || minute < fb.at || phase.kind === "done") continue;
      if (phase.kind === "recover") continue;
      fixedDone.add(fb.at);
      const poi = nearestPoi(pos, fb.min >= 30 ? 800 : 250, false);
      const label = poi ? poi.name : "in place · vehicle shade";
      const resume: Phase = phase;
      if (poi && distM(pos, poi.pos) > 40) {
        const leg = legTo(poi.pos, "poi", poi.name, minute);
        phase = { kind: "travel", leg, progress: 0, then: { kind: "recover", poi, remaining: fb.min, label, resume, state: "BREAK" } };
      } else {
        phase = { kind: "recover", poi, remaining: fb.min, label, resume, state: "BREAK" };
      }
      events?.push({ tick: t, actor: w.id, type: "BREAK", title: `${fb.label} · ${fb.min} min`, detail: `${label}. Fixed schedule, applies regardless of policy.`, data: { minutes: fb.min, where: label } });
    }

    // --- agent: recovery scheduling ----------------------------------------
    if (policy.agentOn && (phase.kind === "travel" || phase.kind === "service") && !(phase.kind === "travel" && phase.then.kind === "recover")) {
      const cellHi = heatIndexF(cToF(tempAtC(pos, minute)), humidity(minute));
      const exposure: Exposure = phase.kind === "service" ? "sun" : mob.travelExposure;
      const activity: Activity = phase.kind === "service" ? w.workload : mob.travelActivity;
      const net = projectedNet(cellHi, exposure, activity);
      const projected = strain + Math.max(0, net) * policy.horizonMin;
      const gapOk = t - lastRecoveryEnd >= policy.minGapMin;
      if (gapOk && strain > 25 && (projected >= policy.recoveryTrigger || strain >= policy.recoveryTrigger - 6)) {
        const poi = nearestPoi(pos, policy.poiRadiusM, false);
        const label = poi ? poi.name : "in place · vehicle shade";
        const resume: Phase = phase;
        recoveries++;
        lastRecoveryEnd = t + policy.breakMin + (poi ? Math.round(distM(pos, poi.pos) / mob.speed) : 0);
        const rec: Phase = { kind: "recover", poi, remaining: policy.breakMin, label, resume, state: "RECOVERING" };
        if (poi && distM(pos, poi.pos) > 40) {
          const leg = legTo(poi.pos, "poi", poi.name, minute);
          phase = { kind: "travel", leg, progress: 0, then: rec };
        } else {
          phase = rec;
        }
        events?.push({
          tick: t, actor: w.id, type: "RECOVERY",
          title: `Recovery break at ${poi ? poi.name : "vehicle shade (no cool spot in range)"}`,
          detail: `Strain ${strain.toFixed(0)}, projected ${projected.toFixed(0)} within ${policy.horizonMin} min (trigger ${policy.recoveryTrigger}, limit ${SAFE_LIMIT}). ${policy.breakMin} min ${poi ? (poi.kind === "ac" ? "in air-conditioning" : "in shade") : "in vehicle shade"}${poi ? `, ${Math.round(distM(pos, poi.pos))} m away` : ""}. Route resumes automatically.`,
          data: { strain: +strain.toFixed(1), projected: +projected.toFixed(1), trigger: policy.recoveryTrigger, minutes: policy.breakMin, where: label, kind: poi ? poi.kind : "shade", cellHiF: +cellHi.toFixed(1) },
        });
      }
    }

    // --- advance the phase by one minute -----------------------------------
    let exposure: Exposure = "sun";
    let activity: Activity = "rest";
    let state: WorkerState = "WORKING";
    let legIndex = -1;
    let target = "";

    if (phase.kind === "travel") {
      const leg = legs[phase.leg];
      const len = pathLength(leg.path);
      phase.progress = Math.min(len, phase.progress + mob.speed);
      pos = pointAlong(leg.path, phase.progress);
      exposure = mob.travelExposure; activity = mob.travelActivity; state = "TRAVELING"; legIndex = phase.leg;
      target = leg.kind === "poi" ? `→ ${leg.label}` : `→ ${leg.label}`;
      if (phase.progress >= len) {
        pos = leg.path[leg.path.length - 1];
        phase = phase.then;
      }
    } else if (phase.kind === "service") {
      exposure = "sun"; activity = w.workload; state = "WORKING";
      target = `Delivering · ${phase.stop.label}`;
      phase.remaining -= 1;
      if (phase.remaining <= 0) {
        stopsDone++;
        phase = nextStopPhase(minute);
        if (phase.kind === "done") {
          finishedTick = t;
          const backLeg = legTo(DEPOT.pos, "depot", DEPOT.name, minute);
          phase = { kind: "travel", leg: backLeg, progress: 0, then: { kind: "done" } };
          events?.push({ tick: t, actor: w.id, type: "COMPLETE", title: `Route complete · ${stopsDone} stops`, detail: `Peak strain so far ${peak.toFixed(0)} · ${recoveries} recovery breaks · ${reroutes} reroutes. Returning to depot.`, data: { stops: stopsDone, peak: +peak.toFixed(1), recoveries, reroutes } });
        }
      }
    } else if (phase.kind === "recover") {
      exposure = phase.poi ? phase.poi.kind : "cab";
      activity = "rest"; state = phase.state;
      target = `${phase.state === "BREAK" ? "Break" : "Recovering"} · ${phase.label}`;
      if (phase.state === "RECOVERING") minutesRecovering++;
      phase.remaining -= 1;
      const early = phase.state === "RECOVERING" && phase.remaining <= 0 && strain > policy.recoveryTrigger - 12 && phase.remaining > -policy.breakMin;
      if (phase.remaining <= 0 && !early) {
        // resume what was interrupted (walk back if we moved)
        const resume: Phase = phase.resume;
        if (resume.kind === "service" && distM(pos, resume.stop.pos) > 40) {
          const leg = legTo(resume.stop.pos, "stop", resume.stop.label, minute);
          phase = { kind: "travel", leg, progress: 0, then: resume };
        } else if (resume.kind === "travel") {
          const orig = legs[resume.leg];
          const dest = orig.path[orig.path.length - 1];
          const leg = legTo(dest, orig.kind, orig.label, minute);
          phase = { kind: "travel", leg, progress: 0, then: resume.then };
        } else {
          phase = resume;
        }
      }
    } else {
      // done: resting at depot
      exposure = "ac"; activity = "rest"; state = "DONE"; target = "Shift complete · at depot";
    }

    // --- physiology --------------------------------------------------------
    const tempC = tempAtC(pos, minute);
    const hiF = heatIndexF(cToF(tempC), humidity(minute));
    const r = stepStrain(strain, hiF, exposure, activity, acclim);
    strain = r.strain;
    if (strain > peak) { peak = strain; peakTick = t; }

    const newLevel = levelOf(strain);
    // step the alert level down only once strain has clearly left the band
    while (LEVEL_RANK[alertLevel] > 0 && strain < LEVEL_THRESHOLD[alertLevel] - 15) alertLevel = LEVELS[LEVEL_RANK[alertLevel] - 1];
    if (LEVEL_RANK[newLevel] > LEVEL_RANK[alertLevel]) {
      alertLevel = newLevel;
      const advice = newLevel === "RED" ? "Stop work, cool down, hydrate. Supervisor paged." : newLevel === "ORANGE" ? "Drink 250 ml now, slow the pace, next check in 10 min." : "Drink water, watch for dizziness or cramps.";
      events?.push({ tick: t, actor: w.id, type: "NOTIFY", title: `Exposure ${newLevel} · strain ${strain.toFixed(0)}`, detail: `${advice}${policy.agentOn ? "" : " (Monitor-only mode: no route action taken.)"}`, data: { level: newLevel, strain: +strain.toFixed(1), hiF: +hiF.toFixed(1) } });
    }
    level = newLevel;

    if (strain >= SAFE_LIMIT && !inBreach) {
      inBreach = true; breaches++;
      events?.push({ tick: t, actor: w.id, type: "BREACH", title: "Safe limit exceeded", detail: `Strain reached ${strain.toFixed(0)} (limit ${SAFE_LIMIT}) at ${nearestCross(pos)} — heat-illness risk. Recordable exposure event.`, data: { strain: +strain.toFixed(1), hiF: +hiF.toFixed(1), where: nearestCross(pos) } });
    } else if (strain < SAFE_LIMIT - 8) inBreach = false;

    ticks.push({ pos, strain, level, state, hiF, tempC, hiEffF: r.hiEffF, stopsDone, legIndex, target });
  }

  return {
    workerId: w.id, ticks, legs, order: opts.order.map((s) => s.id), peak, peakTick, breaches, recoveries, reroutes,
    stopsDone, totalStops: opts.order.length, finishedTick, minutesRecovering,
  };
}

/** Strain-minutes above 60 — the exposure the agent tries to minimise. */
export function excessExposure(run: WorkerRun): number {
  let x = 0;
  for (const t of run.ticks) x += Math.max(0, t.strain - 60);
  return x;
}

function nearestPoi(pos: LngLat, radius: number, allowAny: boolean): Poi | null {
  let best: Poi | null = null, bd = Infinity;
  for (const p of POIS) {
    const d = distM(pos, p.pos) + (p.kind === "shade" ? 150 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  if (!best) return null;
  return allowAny || distM(pos, best.pos) <= radius ? best : null;
}

// ------------------------------------------------------------- fleet run --
export function runFleet(policy: Policy, dayIso?: string): FleetRun {
  if (dayIso) setReplayDay(dayIso);
  const day = getReplayDay();
  const ledger = new Ledger();
  const events: PendingEvent[] = [];
  const workers: Record<string, WorkerRun> = {};

  ledger.add(0, "fleet", "GENESIS", "Shift opened", `${day.iso}. Policy ${policy.agentOn ? "ON — agent may act" : "OFF — monitor only"}. Trigger ${policy.recoveryTrigger}, horizon ${policy.horizonMin} min, break ${policy.breakMin} min. Grid: 20 m hourly (FortyGuard-style), Phoenix downtown. Code v0.4.`, { day: day.iso, agentOn: policy.agentOn, recoveryTrigger: policy.recoveryTrigger, horizonMin: policy.horizonMin, breakMin: policy.breakMin });
  if (day.advisory !== "None") {
    ledger.add(0, "fleet", "ADVISORY", `${day.advisory} in effect`, `NWS Phoenix: ${day.advisory}, forecast high ${day.highF} °F. OSHA high-heat trigger (HI ≥ 90 °F) expected by ${day.highF >= 114 ? "09:00" : "10:00"}.`, { source: "NWS", highF: day.highF });
  }

  for (const w of WORKERS) {
    const stops = stopsFor(w.id);
    const baseline = nearestNeighborOrder(DEPOT.pos, stops);
    let order = baseline;
    if (policy.agentOn && policy.resequence) {
      const hot = stops.filter((s) => anomalyAt(s.pos) > 0.3);
      const cool = stops.filter((s) => anomalyAt(s.pos) <= 0.3);
      const hotFirst = nearestNeighborOrder(DEPOT.pos, hot);
      const rest = nearestNeighborOrder(hotFirst.length ? hotFirst[hotFirst.length - 1].pos : DEPOT.pos, cool);
      const candidate = [...hotFirst, ...rest];
      // projected peaks under monitor-only running for both orders
      const offPolicy = { ...policy, agentOn: false };
      const r0 = simulateWorker(w, { policy: offPolicy, order: baseline });
      const r1 = simulateWorker(w, { policy: offPolicy, order: candidate });
      const x0 = excessExposure(r0), x1 = excessExposure(r1);
      if (hot.length && x1 < x0 * 0.97) {
        order = candidate;
        events.push({
          tick: 0, actor: w.id, type: "RESEQUENCE",
          title: `${hot.length} hot-cell stops moved to the morning`,
          detail: `Stops in cells ≥ +0.3 anomaly (${hotFirst.map((s) => s.id).join(", ")}) now run first, while air temp is still below 100 °F. Projected unmanaged excess exposure ${x0.toFixed(0)} → ${x1.toFixed(0)} strain·min (−${Math.round((1 - x1 / x0) * 100)}%).`,
          data: { moved: hotFirst.map((s) => s.id), exposureBefore: Math.round(x0), exposureAfter: Math.round(x1) },
        });
      }
    }
    workers[w.id] = simulateWorker(w, { policy, order, events });
  }

  // fleet summary at shift end
  const stopsDone = Object.values(workers).reduce((a, r) => a + r.stopsDone, 0);
  const totalStops = Object.values(workers).reduce((a, r) => a + r.totalStops, 0);
  const totalBreaches = Object.values(workers).reduce((a, r) => a + r.breaches, 0);
  const fleetPeak = Math.max(...Object.values(workers).map((r) => r.peak));
  events.push({ tick: TICKS - 1, actor: "fleet", type: "SHIFT_END", title: "Shift closed", detail: `${stopsDone}/${totalStops} stops · fleet peak strain ${fleetPeak.toFixed(0)} · ${totalBreaches} limit breach${totalBreaches === 1 ? "" : "es"}. Ledger sealed.`, data: { stopsDone, totalStops, fleetPeak: +fleetPeak.toFixed(1), breaches: totalBreaches } });

  // merge by time (stable by insertion for ties)
  events.sort((a, b) => a.tick - b.tick);
  for (const e of events) ledger.add(e.tick, e.actor, e.type, e.title, e.detail, e.data);

  const totalDecisions = ledger.entries.filter((e) => e.type === "RESEQUENCE" || e.type === "REROUTE" || e.type === "RECOVERY").length;
  return { policy, workers, ledger: ledger.entries, fleetPeak, totalBreaches, totalDecisions, stopsDone, totalStops };
}

export const tickToClock = (tick: number) => minuteToClock(SHIFT_START_MIN + tick);
export { SHIFT_START_MIN, SHIFT_END_MIN, TICKS };
export type { Worker, Workload, Stop, Poi };
