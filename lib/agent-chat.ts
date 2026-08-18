// Rules-based "ask the agent" — explains decisions straight from the ledger and
// the run state, so answers are grounded and reproducible offline. Swap the
// body of `answer()` for an LLM call (e.g. Claude with the ledger as context)
// when a key is available; the grounding data is already assembled here.
import { WORKERS, workerById } from "./fleet";
import { COLS, GRID, fromXY, nearestCross, getAnomalyField } from "./geo";
import { SAFE_LIMIT, tickToClock, verifyLedger, type FleetRun, type Policy } from "./sim";
import { anomalyAmpC, baseTempC, cToF, heatIndexF, humidity, SHIFT_START_MIN } from "./weather";
import { fmtStrain, fmtTempC } from "./format";
import type { Units } from "./store";

export interface ChatCtx {
  runs: { on: FleetRun; off: FleetRun };
  run: FleetRun;
  policy: Policy;
  tick: number;
  selectedWorkerId: string;
  units: Units;
}

export const SUGGESTED = [
  "Why did C. Delgado stop?",
  "Where is the hottest corridor right now?",
  "Who is at most risk?",
  "What if the agent were off?",
  "Compliance summary",
];

function findWorker(q: string, fallback: string) {
  for (const w of WORKERS) {
    const last = w.name.split(" ")[1].toLowerCase();
    if (q.includes(last) || q.includes(w.initials.toLowerCase()) || q.includes(w.id)) return w;
  }
  return workerById(fallback);
}

export function answer(question: string, ctx: ChatCtx): string {
  const q = question.toLowerCase();
  const { run, tick, policy, units } = ctx;
  const time = tickToClock(tick);
  const upTo = run.ledger.filter((e) => e.tick <= tick);
  const w = findWorker(q, ctx.selectedWorkerId);
  const wr = run.workers[w.id];
  const now = wr.ticks[tick];

  if (/(what if|without|were off|turned off|agent off|policy off|counterfactual)/.test(q)) {
    const on = ctx.runs.on, off = ctx.runs.off;
    return `Same day, same routes, same fixed breaks. Agent OFF (warnings only): fleet peak strain ${fmtStrain(off.fleetPeak)}, ${off.totalBreaches} safe-limit breach${off.totalBreaches === 1 ? "" : "es"}, ${off.stopsDone}/${off.totalStops} stops. Agent ON: peak ${fmtStrain(on.fleetPeak)}, ${on.totalBreaches} breaches, ${on.stopsDone}/${on.totalStops} stops, ${on.totalDecisions} logged decisions. The difference is roughly ${off.totalStops - on.stopsDone} deferred stops against ${off.totalBreaches} recordable heat exposure events.`;
  }

  if (/(hottest|corridor|where is the heat|hot spot|hotspot|worst street)/.test(q)) {
    const field = getAnomalyField();
    let best = -Infinity, bi = 0;
    for (let i = 0; i < field.length; i += 7) if (field[i] > best) { best = field[i]; bi = i; }
    const r = Math.floor(bi / COLS), c = bi % COLS;
    const p = fromXY((c + 0.5) * GRID.cellM, (r + 0.5) * GRID.cellM);
    const minute = SHIFT_START_MIN + tick;
    const t = baseTempC(minute) + anomalyAmpC(minute) * best;
    return `Right now (${time}) the hottest cells in the grid are around ${nearestCross(p)}: about ${fmtTempC(t, units)} in that cell versus a city mean of ${fmtTempC(baseTempC(minute), units)} — heat index ≈ ${heatIndexF(cToF(t), humidity(minute)).toFixed(0)}°F. Wide asphalt corridors and the rail-yard/industrial blocks south of Jackson St run consistently ${(anomalyAmpC(minute) * 1.2).toFixed(1)}°C or more above the mean; parks like Hance and Encanto run cooler. Reroutes avoid legs whose default path crosses those cells.`;
  }

  if (/(who|most risk|riskiest|highest strain|worst off|at risk)/.test(q)) {
    const ranked = WORKERS.map((x) => ({ w: x, s: run.workers[x.id].ticks[tick] })).sort((a, b) => b.s.strain - a.s.strain);
    const top = ranked[0];
    return `At ${time}: ${ranked.map((x) => `${x.w.name} ${fmtStrain(x.s.strain)} (${x.s.level.toLowerCase()}, ${x.s.state.toLowerCase()})`).join(" · ")}. ${top.w.name} carries the most strain — ${top.w.workload} workload, ${top.w.acclimatized ? "acclimatized" : "NOT acclimatized"}, currently in a cell at ${top.s.hiF.toFixed(0)}°F heat index. ${policy.agentOn ? `The agent will schedule recovery once projected strain reaches ${policy.recoveryTrigger} within ${policy.horizonMin} min.` : "Agent is off — monitor-only, no protective action will be taken."}`;
  }

  if (/(compliance|summary|report|osha|audit|ledger|hash|verified|verify)/.test(q)) {
    const dec = upTo.filter((e) => ["RESEQUENCE", "REROUTE", "RECOVERY"].includes(e.type)).length;
    const breaches = upTo.filter((e) => e.type === "BREACH").length;
    const ok = verifyLedger(upTo) === -1;
    const last = upTo[upTo.length - 1];
    return `Compliance snapshot at ${time}: ${upTo.length} ledger entries, chain ${ok ? "verified" : "BROKEN"} (head ${last?.hash.slice(0, 12)}…). ${dec} protective decisions, ${upTo.filter((e) => e.type === "NOTIFY").length} worker notifications, ${breaches} safe-limit breach${breaches === 1 ? "" : "es"}. Each entry records who, when, the grid conditions, the projected strain and the rule that fired — the documentation an employer needs to show a written heat plan was actually executed (proposed 29 CFR 1910.148 / OSHA-2021-0009). Export from the Ledger panel.`;
  }

  if (/(policy|trigger|threshold|setting|how do you decide|rule)/.test(q)) {
    return `Current policy: agent ${policy.agentOn ? "ON" : "OFF"}. I estimate each worker's strain index every minute from the heat index in their 20 m cell (FortyGuard-style grid), sun/shade/AC exposure, workload and acclimatization. If strain is projected to reach ${policy.recoveryTrigger} within ${policy.horizonMin} min I schedule a ${policy.breakMin}-min recovery at the nearest cool spot within ${policy.poiRadiusM} m (AC preferred), with at least ${policy.minGapMin} min between recoveries. Legs are rerouted when the default path crosses a cell ≥ 1.5 °C above the city mean and the alternate is materially cooler. Hot-cell stops are moved into the morning at shift start. Safe limit is ${SAFE_LIMIT}; a breach is a recordable event.`;
  }

  if (/(reroute|route|path|detour|why.*(go|went) around)/.test(q)) {
    const e = [...upTo].reverse().find((x) => x.type === "REROUTE" && x.actor === w.id) ?? [...upTo].reverse().find((x) => x.type === "REROUTE");
    if (!e) return `No reroutes logged yet${policy.agentOn ? "" : " — the agent is off"}. Reroutes appear when a delivery leg's default street path crosses a hot corridor and the alternate block is cooler.`;
    return `${e.time} · ${workerById(e.actor).name}: ${e.title}. ${e.detail} Ledger #${e.seq}, hash ${e.hash.slice(0, 12)}….`;
  }

  if (/(why|stop|break|recover|rest|pause|shade|cool)/.test(q)) {
    const e = [...upTo].reverse().find((x) => x.actor === w.id && (x.type === "RECOVERY" || x.type === "BREAK"));
    if (!e) {
      return `${w.name} hasn't needed a recovery break yet (strain ${fmtStrain(now.strain)}, ${now.level.toLowerCase()}, ${now.target}). ${policy.agentOn ? `I'll act when strain is projected to hit ${policy.recoveryTrigger} within ${policy.horizonMin} min.` : "Agent is off — I would only warn."}`;
    }
    const d = e.data as Record<string, string | number>;
    return `${e.time} · ${w.name}: ${e.title}. ${e.detail}${e.type === "RECOVERY" ? ` Grid heat index in that cell was ${d.cellHiF}°F; ${w.workload} workload, ${w.acclimatized ? "acclimatized" : "not yet acclimatized"}.` : ""} Now: strain ${fmtStrain(now.strain)} (${now.level.toLowerCase()}), ${now.target}. Ledger #${e.seq}.`;
  }

  if (/(strain|how is|status|doing|health)/.test(q)) {
    return `${w.name} at ${time}: strain ${fmtStrain(now.strain)} (${now.level.toLowerCase()}), ${now.state.toLowerCase()} — ${now.target}. Cell heat index ${now.hiF.toFixed(0)}°F (${fmtTempC(now.tempC, units)} air), stops ${now.stopsDone}/${wr.totalStops}. Peak so far ${fmtStrain(Math.max(...wr.ticks.slice(0, tick + 1).map((t) => t.strain)))}, ${wr.recoveries} recoveries planned across the day.`;
  }

  return `I can explain any decision in the ledger. Try: "Why did ${w.name} stop?", "Where is the hottest corridor right now?", "Who is at most risk?", "What if the agent were off?", or "Compliance summary". Every answer is grounded in the same data the ledger records — grid temperature in the worker's 20 m cell, projected strain, and the policy rule that fired.`;
}
