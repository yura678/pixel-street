#!/usr/bin/env node
/**
 * Review shots of the spec houses (building redesign plan, «Візуальна перевірка»).
 *
 *   npm run shots                          every house that has a BuildingSpec
 *   npm run shots -- --only=no114,no118    selected houses
 *   npm run shots -- --chunk=3             the houses of one chunk
 *   npm run shots -- --views=front,evening a subset of views
 *   npm run shots -- --webgl               machines whose browser has no WebGPU adapter
 *   npm run shots -- --parts               the parts showcase (`?debug=parts`), every stand
 *                                          front-on and at an angle: parts_<stand>_<view>.png
 *   npm run shots -- --cam=110,15,1.8,-3.1,0.12 --name=gable [--evening] [--taxi] [--query=…]
 *                                          one close-up from a camera of your own
 *                                          (`z,look,zoom,az,el`): cam_<name>.png; `--query` adds
 *                                          URL parameters; `--taxi` keeps the taxi in the shot
 *   npm run shots -- --tour [--views=day,evening,far,farEvening]
 *                                          the drive round the whole loop: from the taxi lane
 *                                          every 20 m by day and at dusk (tour_day_<z>.png,
 *                                          tour_evening_<z>.png) and the silhouette of every
 *                                          80 m from a far camera across the road (tour_far_<z>.png,
 *                                          tour_farEvening_<z>.png)
 *   npm run shots -- --water [--views=rain,downpour,golden,evening]
 *                                          the taxi driving through a puddle in each weather:
 *                                          mid-splash (water_<view>_splash.png) and the wet tyre
 *                                          tracks it leaves (water_<view>_tracks.png). The taxi
 *                                          stays visible and really drives (wheel contacts,
 *                                          splashes and tracks come from the simulation).
 *   npm run shots -- --bounds              the viewer's extreme camera views (`CameraRig`
 *                                          `CAMERA_LIMITS`): the camera on the taxi at a few
 *                                          places on the loop, each side and frontal × lowest and
 *                                          highest angle, zoomed all the way out:
 *                                          bounds_<z>_<view>.png
 *
 * Per house, into `shots/` (git-ignored):
 *   <id>_taxi.png      three-quarter view from the taxi lane
 *   <id>_front.png     square-on elevation
 *   <id>_entrance.png  close-up of the way in
 *   <id>_evening.png   elevation at dusk: lit windows, lamps and signs ("Sunset Evening")
 *   <id>_alley.png, <id>_alleyEvening.png   houses with a flank facade: the flank seen from
 *                      the alley or square it faces, by day and at dusk
 *
 * Frames are deterministic: the app's animation loop is stopped, the taxi hidden and the
 * loop ticked by hand with fixed timestamps.
 *
 * Browser: CHROME_PATH, else the usual Chrome / Chromium install locations.
 * The app itself stays WebGPU-only. `--webgl` changes nothing in it: inside the headless
 * browser it reports a fake GPU adapter whose device request fails, so three.js falls back
 * to its WebGL2 backend for these shots only (useful in CI / software-GPU containers, where
 * WebGPU runs on SwiftShader and loses its device on a scene this size).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { getBuildingSpec } from '../src/config/buildings/index.js';
import { LANE_X } from '../src/config/streetProfile.js';
import {
  LOOP_LENGTH,
  StreetLayout,
  TOTAL_LOOP_CHUNKS,
} from '../src/simulation/street/StreetLayout.js';
import { planBuilding } from '../src/world/architecture/SpecPlanner.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'shots');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    // Split on the first `=` only: `--query=camera.distance=40` keeps its value whole
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  // Per-user Chrome install on Windows
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/** Every spec house with its world position and the camera targets of its views. */
function housesToShoot() {
  const lots = [];
  for (let c = 0; c < TOTAL_LOOP_CHUNKS; c++) {
    for (const lot of StreetLayout.getChunk(c, null).right) lots.push({ lot, chunk: c });
  }
  const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
  const houses = [];
  lots.forEach(({ lot, chunk }, i) => {
    const spec = getBuildingSpec(lot.spec);
    if (!spec) return;
    if (only && !only.has(lot.spec)) return;
    if (args.chunk !== undefined && Number(args.chunk) !== chunk) return;
    const plan = planBuilding(spec, lot, lots[(i + 1) % lots.length].lot);
    const entrance = plan.entrances[0]?.z ?? spec.entrances.find((e) => e.z !== undefined)?.z ?? 0;
    // A flank facade is shot from the open lot it faces, aiming down its middle
    const flank = plan.flanks[0];
    const open = flank && lots[(i + flank.side + lots.length) % lots.length].lot;
    houses.push({
      id: lot.spec,
      z: lot.centerZ + plan.zC,
      entranceZ: lot.centerZ + entrance,
      height: plan.top,
      width: plan.width,
      setback: plan.facadeX,
      flank: flank
        ? { side: flank.side, z: lot.centerZ + flank.z + flank.side * open.width * 0.5 }
        : null,
    });
  });
  return houses;
}

/**
 * Camera of each view. `look` is the height the camera aims at; the zoom keeps the whole house
 * (or the door) in frame from the camera's distance to the facade.
 */
/** Zoom that fits `size` metres into the frame from `reach` metres in front of the facade. */
const fitZoom = (size, reach) => Math.min(2.4, Math.max(0.25, (size / 0.62 - reach) / 19));

/** Two views of a showcase stand: square-on and three-quarter. */
function standViews(s) {
  const zoom = fitZoom(Math.max(s.h * 1.15, (s.z1 - s.z0) * 0.62), 3.6);
  const z = (s.z0 + s.z1) * 0.5;
  return {
    front: { cam: { z, look: s.h * 0.5, zoom, az: -3.1, el: 0.12 } },
    angle: { cam: { z, look: s.h * 0.45, zoom: zoom * 0.8, az: -2.55, el: 0.18 } },
  };
}

function viewsOf(h) {
  const reach = 3.6 + h.setback; // camera anchor (street) → facade
  const fit = (size) => fitZoom(size, reach);
  const whole = fit(Math.max(h.height * 1.35, h.width * 0.8));
  const front = { z: h.z, look: h.height * 0.5, zoom: whole, az: -3.1, el: 0.12 };
  const views = {
    taxi: {
      cam: { z: h.z, look: Math.min(6, h.height * 0.5), zoom: whole * 0.9, az: -2.6, el: 0.15 },
    },
    front: { cam: front },
    entrance: { cam: { z: h.entranceZ, look: 1.7, zoom: fit(4.2), az: -2.85, el: 0.2 } },
    evening: { query: 'preset=Sunset%20Evening', cam: front },
  };
  if (h.flank) {
    // Into the alley, from the side the flank faces (the camera orbits −Z for az > −π)
    const alley = {
      z: h.flank.z,
      look: Math.min(6.5, h.height * 0.4),
      zoom: fit(h.height * 1.1),
      az: h.flank.side > 0 ? -3.8 : -2.48,
      el: 0.16,
    };
    views.alley = { cam: alley };
    views.alleyEvening = { query: 'preset=Sunset%20Evening', cam: alley };
  }
  return views;
}

const EVENING = 'preset=Sunset%20Evening';
/** The far camera stands this far back (`camera.distance` × the widest zoom ≈ 104 m). */
const FAR = 'camera.distance=40';

/**
 * The drive round the loop, grouped by URL so the page reloads once per lighting: the taxi
 * lane every 20 m (mid-chunk), the far silhouette every 80 m (as the street elevation's rows).
 */
function tourShots(wanted) {
  const shots = [];
  const add = (view, query, cams) => {
    if (wanted && !wanted.has(view)) return;
    for (const cam of cams) {
      shots.push({ query, cam, name: `tour_${view}_${String(cam.z).padStart(3, '0')}.png` });
    }
  };
  const lane = [];
  for (let z = 10; z < LOOP_LENGTH; z += 20)
    lane.push({ z, look: 5.5, zoom: 1.7, az: -2.6, el: 0.15 });
  // …and one more across the loop's seam (№ 166 | № 100)
  const far = [40, 120, 200, LOOP_LENGTH].map((z) => ({
    z,
    look: 8,
    zoom: 2.6,
    az: -3.1,
    el: 0.09,
  }));
  add('day', '', lane);
  add('evening', EVENING, lane);
  add('far', FAR, far);
  add('farEvening', `${FAR}&${EVENING}`, far);
  return shots;
}

/** `--water` views → weather preset (URL-encoded). */
const WATER_PRESETS = {
  rain: 'Rain',
  downpour: 'Downpour',
  golden: 'Golden%20Hour',
  evening: 'Sunset%20Evening',
};

/**
 * `--water` shots of one drive: how far the front wheel is past the puddle centre, and the
 * camera (`dz` from the puddle along the street, `look` height, `zoom`, `az`, `el`).
 */
const WATER_DRIVES = {
  splash: { ahead: 0.3, cam: { dz: 0.4, look: 0.5, zoom: 0.6, az: -2.72, el: 0.4 } },
  tracks: { ahead: 9, cam: { dz: 6.5, look: 0.4, zoom: 0.85, az: -2.45, el: 0.42 } },
};

/**
 * In the page: pick a puddle one of the taxi's wheel lines runs through and park the taxi
 * 14 m before it, cruising. Returns the puddle (X, Z) or null.
 * @param {number} laneX the taxi's cruising lane (`LANE_X`)
 */
function findWaterPuddle(laneX) {
  const st = window.__street;
  const level = st.weather.puddleLevel;
  const scale = Math.sqrt(Math.min(1, Math.max(0, (level - 0.1) / 0.7)));
  for (let c = 2; c < 12; c++) {
    for (const p of st.puddles.getPuddlesForChunk(c)) {
      for (const wx of [laneX + 0.82, laneX - 0.82]) {
        if (!st.puddles.isPointInPuddle(wx, p.z, p, scale * 0.6)) continue;
        window.__water = { x: p.x, z: p.z, laneX, started: false };
        st.taxiView.root.visible = true;
        return window.__water;
      }
    }
  }
  return null;
}

/** In the page: drive the taxi on until its front wheel is `ahead` m past the puddle. */
async function driveThroughPuddle({ ahead, cam }) {
  const st = window.__street;
  const app = st.app;
  const loop = app.loop;
  const rig = st.cameraRig;
  const w = window.__water;
  if (!w.started) {
    w.started = true;
    st.taxi.z = w.z - 14;
    st.taxi.x = w.laneX;
    st.taxi.speed = st.store.get('taxi.cruiseSpeed');
  }
  if (app.isPaused) app.togglePause();

  const view = { z: w.z + cam.dz, zoom: cam.zoom, az: cam.az, el: cam.el, immediate: true };
  rig.teleportTo({ ...view, y: cam.look });
  loop.resetClock();
  loop.tick(0);
  rig.teleportTo({ ...view, y: cam.look * 2 - rig.anchorY });

  // Frames are queued much faster than the GPU draws them: wait for the queue now and then,
  // or the screenshot shows a frame from a second ago
  const device = st.renderer.webgpuRenderer.backend?.device;
  const drain = async () => {
    if (device) await device.queue.onSubmittedWorkDone();
    await new Promise((r) => setTimeout(r, 0));
  };
  const target = w.z - 1.35 + ahead;
  const now = loop.frame.time;
  for (let i = 1; st.taxi.z < target && i < 3000; i++) {
    loop.tick(i * (1000 / 60));
    if (i % 4 === 0) await drain();
  }
  await drain();
  return loop.frame.time - now;
}

async function main() {
  const custom = typeof args.cam === 'string' ? args.cam.split(',').map(Number) : null;
  const special = args.parts || custom || args.tour || args.water || args.bounds;
  const houses = special ? [] : housesToShoot();
  if (!special && houses.length === 0) {
    console.log('No spec houses match.');
    return;
  }
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error('No Chrome found – set CHROME_PATH to a Chrome / Chromium binary.');
  const wanted = typeof args.views === 'string' ? new Set(args.views.split(',')) : null;
  mkdirSync(outDir, { recursive: true });

  const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      // Chrome refuses to sandbox as root (containers, CI)
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      ...(args.webgl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : []),
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.warn('  page error:', e.message));
    if (args.webgl) {
      await page.evaluateOnNewDocument(() => {
        const adapter = {
          features: new Set(),
          limits: {},
          info: {},
          requestDevice: async () => {
            throw new Error('WebGL2 review shots');
          },
        };
        Object.defineProperty(navigator, 'gpu', {
          value: {
            requestAdapter: async () => adapter,
            getPreferredCanvasFormat: () => 'bgra8unorm',
          },
        });
      });
    }

    let loaded = null;
    const load = async (query) => {
      if (query === loaded) return;
      await page.goto(base + query);
      await page.waitForFunction(() => window.__street?.app?.loop, { timeout: 180_000 });
      await page.evaluate(() => {
        const st = window.__street;
        st.renderer.webgpuRenderer.setAnimationLoop(null);
        if (!st.app.isPaused) st.app.togglePause();
      });
      loaded = query;
    };
    const shoot = async (cam, name) => {
      await page.evaluate(async ({ look, showTaxi, ...c }) => {
        const st = window.__street;
        const rig = st.cameraRig;
        const loop = st.app.loop;
        // `--taxi`: the taxi stays in the shot, parked in its lane where the camera looks
        st.taxiView.root.visible = Boolean(showTaxi);
        // Park the (hidden) taxi under the camera: the road streams around the taxi
        st.taxi.z = c.z;
        // Low camera angles lift the aim point; measure it once and shift the camera so it
        // aims at `look` (the first tick after a clock reset snaps the rig, no damping).
        rig.teleportTo({ ...c, y: look, immediate: true });
        loop.resetClock();
        loop.tick(0);
        rig.teleportTo({ ...c, y: look * 2 - rig.anchorY, immediate: true });
        loop.resetClock();
        loop.frame.time = 100;
        for (let i = 0; i < 24; i++) {
          loop.tick(i * 16);
          await new Promise((r) => setTimeout(r, 0));
        }
      }, cam);
      await new Promise((r) => setTimeout(r, 300));
      await page.screenshot({ path: resolve(outDir, name) });
      console.log(`  ${name}`);
    };

    if (args.parts) {
      const query = '?debug=parts&forge=0&render.autoQuality=false&camera.sway=0';
      await load(query);
      const stands = await page.evaluate(() => window.__street.partsShowcase.stands);
      for (const s of stands) {
        for (const [view, v] of Object.entries(standViews(s))) {
          if (wanted && !wanted.has(view)) continue;
          await shoot(v.cam, `parts_${s.id}_${view}.png`);
        }
      }
    }
    if (custom) {
      const [z, look, zoom, az, el] = custom;
      const evening = args.evening ? '&preset=Sunset%20Evening' : '';
      const extra = typeof args.query === 'string' ? `&${args.query}` : '';
      await load(`?debug&forge=0&render.autoQuality=false&camera.sway=0${evening}${extra}`);
      const rawName = String(args.name ?? 'custom').replace(/\.png$/, '');
      const camName = rawName.startsWith('cam_') ? `${rawName}.png` : `cam_${rawName}.png`;
      const directName = `${rawName}.png`;
      await shoot({ z, look, zoom, az, el, showTaxi: Boolean(args.taxi) }, camName);
      if (directName !== camName) {
        copyFileSync(resolve(outDir, camName), resolve(outDir, directName));
        console.log(`  ${directName}`);
      }
    }
    if (args.bounds) {
      await load('?debug&forge=0&render.autoQuality=false&camera.sway=0');
      const views = {
        leftLow: { az: -4.19, el: 0.01 },
        leftHigh: { az: -4.19, el: 1.25 },
        frontLow: { az: -Math.PI, el: 0.01 },
        frontHigh: { az: -Math.PI, el: 1.25 },
        leftMid: { az: -4.19, el: 0.5 },
        rightMid: { az: -2.09, el: 0.5 },
        rightLow: { az: -2.09, el: 0.01 },
        rightHigh: { az: -2.09, el: 1.25 },
      };
      for (const z of [10, 70, 150, 230]) {
        for (const [view, v] of Object.entries(views)) {
          if (wanted && !wanted.has(view)) continue;
          await page.evaluate(
            async ({ z, az, el }) => {
              const st = window.__street;
              const loop = st.app.loop;
              st.taxi.z = z;
              st.cameraRig.setView({ az, el, zoom: 99 });
              loop.resetClock();
              loop.frame.time = 100;
              for (let i = 0; i < 24; i++) {
                loop.tick(i * 16);
                await new Promise((r) => setTimeout(r, 0));
              }
            },
            { z, ...v },
          );
          await new Promise((r) => setTimeout(r, 300));
          const name = `bounds_${z}_${view}.png`;
          await page.screenshot({ path: resolve(outDir, name) });
          console.log(`  ${name}`);
        }
      }
    }
    if (args.water) {
      for (const [view, preset] of Object.entries(WATER_PRESETS)) {
        if (wanted && !wanted.has(view)) continue;
        await load(
          `?debug&forge=0&render.autoQuality=false&camera.sway=0&taxi.stopAtBusStops=false&preset=${preset}`,
        );
        const puddle = await page.evaluate(findWaterPuddle, LANE_X);
        if (!puddle) {
          console.warn(`  ${view}: no puddle on the taxi's wheel lines`);
          continue;
        }
        for (const [shot, drive] of Object.entries(WATER_DRIVES)) {
          await page.evaluate(driveThroughPuddle, drive);
          await new Promise((r) => setTimeout(r, 300));
          await page.screenshot({ path: resolve(outDir, `water_${view}_${shot}.png`) });
          console.log(`  water_${view}_${shot}.png`);
        }
      }
    }
    if (args.tour) {
      for (const s of tourShots(wanted)) {
        await load(
          `?debug&forge=0&render.autoQuality=false&camera.sway=0${s.query ? `&${s.query}` : ''}`,
        );
        await shoot(s.cam, s.name);
      }
    }
    for (const h of houses) {
      for (const [view, v] of Object.entries(viewsOf(h))) {
        if (wanted && !wanted.has(view)) continue;
        await load(
          `?debug&forge=0&render.autoQuality=false&camera.sway=0${v.query ? `&${v.query}` : ''}`,
        );
        await shoot(v.cam, `${h.id}_${view}.png`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
