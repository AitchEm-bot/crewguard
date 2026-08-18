// Demo fleet: a small Phoenix courier crew replaying one heatwave shift.
import { nearestCross, type LngLat } from "./geo";
import { rng } from "./noise";

export type Workload = "light" | "moderate" | "heavy";

export interface Worker {
  id: string;
  name: string;
  initials: string;
  role: string;
  workload: Workload;
  acclimatized: boolean;
  note: string;
  hue: number; // avatar tint
  zone: { lon: [number, number]; lat: [number, number] };
}

export interface Stop {
  id: string;
  workerId: string;
  pos: LngLat;
  label: string;
  serviceMin: number;
}

export interface Poi {
  id: string;
  name: string;
  pos: LngLat;
  kind: "ac" | "shade";
}

export const DEPOT: { name: string; pos: LngLat } = {
  name: "Depot · 4th Ave & Jackson",
  pos: [-112.079, 33.4457],
};

export const WORKERS: Worker[] = [
  {
    id: "courier-1", name: "A. Ruiz", initials: "AR", role: "Courier · parcel van + hand-cart",
    workload: "moderate", acclimatized: true, note: "3rd summer on route", hue: 24,
    zone: { lon: [-112.091, -112.069], lat: [33.455, 33.479] },
  },
  {
    id: "courier-2", name: "B. Okafor", initials: "BO", role: "Courier · e-bike",
    workload: "moderate", acclimatized: true, note: "Acclimatized · full PPE", hue: 200,
    zone: { lon: [-112.071, -112.046], lat: [33.452, 33.479] },
  },
  {
    id: "courier-3", name: "C. Delgado", initials: "CD", role: "Courier · heavy freight",
    workload: "heavy", acclimatized: false, note: "New hire · day 3 (not acclimatized)", hue: 350,
    zone: { lon: [-112.071, -112.046], lat: [33.436, 33.454] },
  },
  {
    id: "courier-4", name: "D. Nguyen", initials: "DN", role: "Courier · documents, on foot",
    workload: "light", acclimatized: true, note: "Acclimatized · light load", hue: 150,
    zone: { lon: [-112.101, -112.073], lat: [33.436, 33.456] },
  },
];

export const POIS: Poi[] = [
  { id: "poi-1", name: "Circle K · Central & Roosevelt", pos: [-112.0745, 33.4589], kind: "ac" },
  { id: "poi-2", name: "Circle K · 7th St & Van Buren", pos: [-112.0655, 33.4516], kind: "ac" },
  { id: "poi-3", name: "Circle K · 7th Ave & McDowell", pos: [-112.0828, 33.466], kind: "ac" },
  { id: "poi-4", name: "Burton Barr Library (cooling center)", pos: [-112.0735, 33.4665], kind: "ac" },
  { id: "poi-5", name: "Margaret T. Hance Park · ramada", pos: [-112.073, 33.4626], kind: "shade" },
  { id: "poi-6", name: "Civic Space Park · shade sails", pos: [-112.0745, 33.4535], kind: "shade" },
  { id: "poi-7", name: "Encanto Park · lagoon shade", pos: [-112.0905, 33.4752], kind: "shade" },
  { id: "poi-8", name: "Heritage Square · shade", pos: [-112.0662, 33.4503], kind: "shade" },
  { id: "poi-9", name: "Convention Center · lobby", pos: [-112.0708, 33.4489], kind: "ac" },
  { id: "poi-10", name: "Cesar Chavez Plaza · trees", pos: [-112.077, 33.449], kind: "shade" },
  { id: "poi-11", name: "Eastlake Park · shade", pos: [-112.048, 33.4478], kind: "shade" },
  { id: "poi-12", name: "Fry's · 1st Ave & Jefferson", pos: [-112.0757, 33.4477], kind: "ac" },
  { id: "poi-13", name: "Capitol Mall · shade", pos: [-112.093, 33.4484], kind: "shade" },
  { id: "poi-14", name: "QuikTrip · 7th St & McDowell", pos: [-112.0655, 33.466], kind: "ac" },
  { id: "poi-15", name: "Verde Park · shade", pos: [-112.0585, 33.4525], kind: "shade" },
  { id: "poi-16", name: "Chase Field · concourse", pos: [-112.0667, 33.4462], kind: "ac" },
  { id: "poi-17", name: "Circle K · 16th St & Van Buren", pos: [-112.0542, 33.4516], kind: "ac" },
  { id: "poi-18", name: "Circle K · 19th Ave & Van Buren", pos: [-112.0975, 33.4516], kind: "ac" },
  { id: "poi-19", name: "Warehouse 215 · dock shade", pos: [-112.0605, 33.4432], kind: "shade" },
  { id: "poi-20", name: "Circle K · 7th Ave & Buckeye", pos: [-112.0828, 33.4425], kind: "ac" },
];

const CENTRAL = -112.074;
const BLOCK = 0.001238;
const STOPS_PER_WORKER = 22;

function makeStops(): Stop[] {
  const out: Stop[] = [];
  WORKERS.forEach((w, wi) => {
    const r = rng(1000 + wi * 97);
    const svc: [number, number] = w.workload === "heavy" ? [15, 24] : w.workload === "light" ? [9, 15] : [12, 20];
    for (let i = 0; i < STOPS_PER_WORKER; i++) {
      // snap to a numbered street, sit mid-block
      const lonRaw = w.zone.lon[0] + r() * (w.zone.lon[1] - w.zone.lon[0]);
      const k = Math.round((lonRaw - CENTRAL) / BLOCK);
      const lon = CENTRAL + k * BLOCK + (r() - 0.5) * 0.0004;
      const lat = w.zone.lat[0] + r() * (w.zone.lat[1] - w.zone.lat[0]);
      const pos: LngLat = [lon, lat];
      out.push({
        id: `s${wi * STOPS_PER_WORKER + i + 1}`,
        workerId: w.id,
        pos,
        label: nearestCross(pos),
        serviceMin: Math.round(svc[0] + r() * (svc[1] - svc[0])),
      });
    }
  });
  return out;
}

export const STOPS: Stop[] = makeStops();
export const stopsFor = (workerId: string) => STOPS.filter((s) => s.workerId === workerId);
export const workerById = (id: string) => WORKERS.find((w) => w.id === id)!;
