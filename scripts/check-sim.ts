import { runFleet, DEFAULT_POLICY, verifyLedger, tickToClock } from "../lib/sim";
import { heatIndexF, baseTempC, cToF, humidity } from "../lib/weather";
import { COLS, ROWS } from "../lib/geo";

console.log("grid", COLS, "x", ROWS, "=", COLS * ROWS);
for (const h of [7, 9, 11, 13, 15, 16, 17]) {
  const m = h * 60; const tC = baseTempC(m); const tF = cToF(tC);
  console.log(h + ":00", tC.toFixed(1) + "C", tF.toFixed(0) + "F", "RH", humidity(m).toFixed(0), "HI", heatIndexF(tF, humidity(m)).toFixed(0));
}
for (const on of [true, false]) {
  const t0 = Date.now();
  const run = runFleet({ ...DEFAULT_POLICY, agentOn: on });
  console.log("\n=== agent", on ? "ON" : "OFF", "in", Date.now() - t0, "ms");
  console.log("peak", run.fleetPeak.toFixed(1), "breaches", run.totalBreaches, "decisions", run.totalDecisions, "stops", run.stopsDone + "/" + run.totalStops, "ledger", run.ledger.length, "verify", verifyLedger(run.ledger));
  for (const w of Object.values(run.workers)) {
    console.log(w.workerId, "peak", w.peak.toFixed(1), "@", tickToClock(w.peakTick), "breaches", w.breaches, "rec", w.recoveries, "rr", w.reroutes, "stops", w.stopsDone, "finished", w.finishedTick != null ? tickToClock(w.finishedTick) : "-", "recMin", w.minutesRecovering, "legs", w.legs.length);
    // hourly strain
    const line = [];
    for (let t = 0; t < w.ticks.length; t += 60) line.push(tickToClock(t) + ":" + w.ticks[t].strain.toFixed(0));
    console.log("   ", line.join(" "));
  }
  const types: Record<string, number> = {};
  for (const e of run.ledger) types[e.type] = (types[e.type] || 0) + 1;
  console.log(types);
  console.log(run.ledger.slice(0, 12).map(e => `#${e.seq} ${e.time} ${e.actor} ${e.type}: ${e.title} — ${e.detail.slice(0, 120)}`).join("\n"));
}
