# CrewGuard

**An AI agent that protects outdoor workers from heat instead of just warning them.**

Heat is the leading weather-related killer in the US, and OSHA's 2026 enforcement push means employers now need *documented* heat protection. Yet crews still run on citywide forecasts and fixed break schedules while real heat risk changes street by street.

CrewGuard puts **FortyGuard's 20 m hourly temperature grid** at the core of an autonomous agent that:

1. **Senses** the heat in each worker's actual 20 m cell (not the airport forecast).
2. **Estimates heat strain** per minute from cell heat index, sun/shade/AC exposure, workload and acclimatization — tracked across the whole shift.
3. **Acts on its own** before anyone crosses a safe limit: resequences hot-cell stops into the morning, reroutes legs around hot corridors, and schedules shaded / air-conditioned recovery breaks.
4. **Proves it**: every observation and decision is appended to a SHA-256 hash-chained ledger that doubles as compliance documentation (proposed 29 CFR 1910.148, Docket OSHA-2021-0009).

Demo: a Phoenix courier fleet replaying **15 Jul 2023** (inside the record 31-day 110 °F+ streak, NWS Excessive Heat Warning). Toggle the agent off to see the same day with warnings only.

Tracks: **Agentic AI** (primary) · Industrial & Enterprise · Data Analysis & Correlation.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

`predev`/`prebuild` copy MapLibre's web-worker bundle into `public/maplibre/` (Turbopack cannot resolve MapLibre 6's `import.meta.url` worker lookup). Basemap tiles come from CARTO (© OpenStreetMap contributors © CARTO).

Useful scripts:

- `npm run check:sim` — runs both policy runs headlessly and prints peaks, breaches, decisions and ledger verification.
- `npx tsx scripts/check-days.ts` — same, across several archive days.
- `npm run shot` — headless-Chrome screenshot of the running dev server (needs Chrome installed; see `scripts/shot.mjs`).

## What's in the UI

| Area | What it shows |
| --- | --- |
| Map | Positron basemap, heat raster (relative to hourly city mean, or absolute heat index), courier pins coloured by strain level, selected courier's dashed current leg + trail, stops, depot, cool spots (AC / shade). |
| Floating pills | Selected courier's strain, cell heat index and stops — anchored to the pin. |
| Replay bar | Scrub 07:00–18:00, play/pause, 30–300× speed. |
| Day picker | Calendar of July 2023 (approx. NWS Sky Harbor highs, dots by severity) — picking a day re-runs both policy runs for that day's curve. |
| Focus mode | Eye button (top-right) or `D` hides the detail cards: map + replay + legend only. The frame scrolls on short screens so cards are never clipped. |
| Worker card | Strain, cell heat index ("feels" after sun/shade/AC), stops, sparkline of the whole day vs the safe limit. |
| Agent activity (dark card) | Live feed of the last ledger entries. |
| Crew card | Avatars, actions/breaches so far, off-policy peak, fleet peak-strain gauge. |
| Rail → Crew | Every courier's live strain bar + the selected courier's route order with done/next markers. |
| Rail → Decision ledger | Full chained ledger with filters, verification status, tamper demo, JSON/CSV export. |
| Rail → Policy | Sliders and levers for the agent (trigger, horizon, break length, gap, radius, resequence, reroute) — re-runs the shift instantly. |
| ? button | "Ask the agent" — grounded, rules-based answers straight from the ledger and run state (swap for an LLM call in `lib/agent-chat.ts`). |
| Top-right toggle | Agent acting ↔ monitor only (warnings, no actions). Both runs are precomputed so the toggle is instant. |

## How it works

```
lib/
  geo.ts        20 m grid over downtown Phoenix + street-scale anomaly field
  weather.ts    hourly base curve for 15 Jul 2023, humidity, NWS heat index
  fleet.ts      couriers, stops (snapped to the Phoenix street grid), cool spots, depot
  sim.ts        minute-by-minute strain model + agent policy + hash-chained ledger
  heatlayer.ts  rasterises the grid into the map's image source
  agent-chat.ts grounded Q&A over the ledger/run
  store.tsx     React state: runs (on/off), replay clock, selection, panels
components/     Rail, TopBar, MapView (MapLibre), ReplayBar, cards, panels, AgentChat
```

**Strain model** (per minute): effective heat index = cell HI ± exposure adjustment (sun +3 °F, van cab −2, shade −6, AC → 78 °F). Gain ∝ (HI_eff − 85)/30 ^1.6 × workload × acclimatization; recovery is much faster at rest, fastest in AC. Levels: green < 40, yellow 40–60, orange 60–80, red ≥ 80; **safe limit = 100** (a breach is a recordable event).

**Agent policy** (defaults, all editable in the Policy panel):
- *Resequence* at shift start: stops in cells ≥ +0.3 anomaly run first, while air temp is still < 100 °F (only kept if projected excess exposure improves).
- *Reroute*: for each leg, compare the two street-grid paths; if the default crosses a cell ≥ 1.2 °C above the city mean and the alternate is ≥ 0.3 °C cooler on average, take it.
- *Recovery*: if strain is projected to reach 68 within 20 min, send the worker to the nearest cool spot within 550 m (AC preferred), 12 min, ≥ 25 min between recoveries, resume the route automatically.
- Fixed breaks (09:30, 12:00 lunch, 15:00) apply in both modes so the on/off comparison is fair.

**Ledger**: `hash = SHA-256(prevHash + JSON(entry))`. `verifyLedger()` recomputes the chain; the "Tamper demo" edits an old entry and shows exactly where the chain breaks.

## Data: swapping in FortyGuard tOS

This build uses a **synthetic** 20 m field (`lib/geo.ts`, `lib/weather.ts`) modelled on the structure of FortyGuard's hourly product: a city-wide base curve plus a street-scale anomaly (asphalt corridors and lots hot, parks and shade cool). Everything downstream — strain model, agent, ledger, map raster — only calls two functions:

```ts
tempAtC(pos, minuteOfDay)      // air temperature in the worker's cell
heatIndexAtF(pos, minuteOfDay) // NWS heat index in that cell
```

To drive the demo from real captures, replace their bodies (or the `getAnomalyField()` cache that `heatlayer.ts` rasterises) with a lookup into a tOS grid fetched for the replay day. Nothing else needs to change.

## Caveats

Demonstration system — not medical advice, not a certified compliance instrument. Worker physiology is a simplified index, not a validated PSI/WBGT model. Coordinates, cool spots and routes are plausible downtown-Phoenix locations, not real fleet data.
