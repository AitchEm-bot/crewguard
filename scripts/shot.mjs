// Dev helper: render the app in headless Chrome and save screenshots.
// usage: node scripts/shot.mjs [url] [outPrefix] [tick] [actions]
import puppeteer from "puppeteer-core";
const url = process.argv[2] || "http://localhost:3000/";
const out = process.argv[3] || "shot";
const tick = process.argv[4] ? Number(process.argv[4]) : null;
const actions = process.argv[5] || "";
const dir = "C:/Users/MIS/AppData/Local/Temp/claude/C--Users-MIS-Desktop-Coding-Projects-crewguard/54177d2b-f161-4087-b67a-835eb3e8c906/scratchpad/";
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1600,900"],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await page.waitForFunction(() => window.__cgMap && window.__cgMap.loaded(), { timeout: 30000 }).catch(() => logs.push("map never loaded"));
if (tick != null) {
  await page.evaluate((t) => { window.__cgSetTick && window.__cgSetTick(t); }, tick);
}
for (const a of actions.split(",").filter(Boolean)) {
  const [kind, sel] = a.split(":");
  if (kind === "click") await page.click(sel);
  if (kind === "wait") await new Promise((r) => setTimeout(r, Number(sel)));
}
await page.waitForFunction(() => window.__cgMap && window.__cgMap.areTilesLoaded(), { timeout: 20000 }).catch(() => logs.push("tiles not loaded"));
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: dir + out + ".png" });
console.log("saved", dir + out + ".png");
console.log(logs.join("\n"));
await browser.close();
