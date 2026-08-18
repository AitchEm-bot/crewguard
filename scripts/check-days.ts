import { runFleet, DEFAULT_POLICY } from "../lib/sim";
for (const d of ["2023-07-31", "2023-07-05", "2023-07-15", "2023-07-19"]) {
  const on = runFleet(DEFAULT_POLICY, d), off = runFleet({ ...DEFAULT_POLICY, agentOn: false }, d);
  console.log(d, "ON peak", on.fleetPeak.toFixed(0), "breaches", on.totalBreaches, "stops", on.stopsDone, "dec", on.totalDecisions, "| OFF peak", off.fleetPeak.toFixed(0), "breaches", off.totalBreaches, "| advisory:", on.ledger[1]?.type === "ADVISORY" ? on.ledger[1].title : "none");
}
