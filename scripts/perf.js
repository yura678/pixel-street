#!/usr/bin/env node
/**
 * Frame time of the street in headless Chrome (WebGPU): where a frame's time goes and what each
 * part of the scene costs. Each case reloads the page, warms up and then records every frame.
 *
 *   npm run perf                         every case at 1600×900, 8 s each
 *   node scripts/perf.js --cases=standing,driving --seconds=10 --size=800x450
 *
 * Cases (`--cases`, comma-separated):
 *   standing     the taxi parked (`taxi.cruiseSpeed=0`), nothing streams
 *   driving      the taxi cruising: chunks, puddles and tracks stream in
 *   noShadows    driving without the sun's shadow map (`render.shadows=false`)
 *   noNear       driving with the near sidewalk hidden (its canopy material)
 *   noWater      driving with the water system off (puddles, splashes, tracks)
 *   noStreet     driving with every street chunk hidden (houses, far sidewalk, near sidewalk)
 *   downpour     driving in the Downpour preset: ~5000 rain drops, wet leaves, thick fog
 *   noFx         the same downpour without the rain and the leaves (`FxSystem` off, hidden)
 *   msaa0 … bare one stage of the frame off at a time, the taxi parked (`--stages` runs them
 *                all with `standing`): MSAA, bloom, grading, all post, fog,
 *                shading (`flat`), shadows; `bare` – all of them off
 *   auto         driving with the quality governor on (`render.autoQuality`): 30 s warm-up for
 *                it to settle, then the rung it settled on and every change it made
 *
 * Every other case pins the quality (`render.autoQuality=false`: full resolution), so the cases
 * compare. `--vsync` keeps Chrome's frame limiter: without it the GPU can run seconds behind
 * (frames queue up), which is fine for throughput but not what a browser does.
 *
 * Per case: FPS from the median frame (the mean is printed too – a rare multi-second hitch
 * drags it far below what the street runs at), p95, hitches over 250 ms, the CPU time of every
 * loop system and of the render call per frame, draw calls and triangles. On a GPU-bound
 * machine the render call's CPU time is the frame time: Chrome holds the main thread until the
 * GPU takes the next frame.
 *
 * Browser: CHROME_PATH, else the usual Chrome install locations. `--gpu=high` asks Dawn for the
 * high-performance adapter (a discrete GPU, if Windows shows one to Chrome).
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const seconds = Number(args.seconds ?? 8);
const warmup = Number(args.warmup ?? 5);
const [width, height] = String(args.size ?? '1600x900')
  .split('x')
  .map(Number);

/**
 * Each case: URL query (after `?forge=0&render.autoQuality=false` – no side panel, fixed
 * quality), what to switch off once it runs, and its own warm-up (s).
 */
const CASES = {
  standing: { query: 'taxi.cruiseSpeed=0' },
  driving: { query: '' },
  noShadows: { query: 'render.shadows=false' },
  noNear: { query: '', hide: 'near' },
  noWater: { query: '', off: ['water'] },
  noStreet: { query: '', hide: 'street' },
  downpour: { query: 'preset=Downpour' },
  noFx: { query: 'preset=Downpour', off: ['fx'], hide: 'fx' },
  auto: { query: 'render.autoQuality=true', warmup: 30 },
  // The frame's stages one by one (`?bench=`, `app/urlParams.js`), the taxi parked so the view
  // is the same: compare each with `standing`
  msaa0: { query: 'taxi.cruiseSpeed=0&bench=msaa0' },
  nobloom: { query: 'taxi.cruiseSpeed=0&bench=nobloom' },
  nograde: { query: 'taxi.cruiseSpeed=0&bench=nograde' },
  nopost: { query: 'taxi.cruiseSpeed=0&bench=nopost' },
  nofog: { query: 'taxi.cruiseSpeed=0&bench=nofog' },
  flat: { query: 'taxi.cruiseSpeed=0&bench=flat' },
  noShadowsStanding: { query: 'taxi.cruiseSpeed=0&render.shadows=false' },
  // One part of the scene hidden (a top-level object by name), the taxi parked
  hideRoad: { query: 'taxi.cruiseSpeed=0', hide: 'RoadView' },
  hideProfile: { query: 'taxi.cruiseSpeed=0', hide: 'StreetProfileView' },
  hideStreet: { query: 'taxi.cruiseSpeed=0', hide: 'StreetView' },
  hideSky: { query: 'taxi.cruiseSpeed=0', hide: 'SkyDome' },
  hideTaxi: { query: 'taxi.cruiseSpeed=0', hide: 'TaxiRoot' },
  hideWater: { query: 'taxi.cruiseSpeed=0', hide: 'Puddles' },
  bare: {
    query: 'taxi.cruiseSpeed=0&render.shadows=false&bench=msaa0,nopost,nofog,flat',
  },
};
/** The default run: the old cases; the stage cases only when asked (`--cases=` or `--stages`). */
const STAGES = [
  'standing',
  'msaa0',
  'nobloom',
  'nograde',
  'nopost',
  'nofog',
  'flat',
  'noShadowsStanding',
  'hideRoad',
  'hideProfile',
  'hideStreet',
  'hideSky',
  'hideTaxi',
  'hideWater',
  'bare',
];
const cases =
  typeof args.cases === 'string'
    ? args.cases.split(',')
    : args.stages
      ? STAGES
      : Object.keys(CASES).filter((c) => !STAGES.includes(c) || c === 'standing');
for (const c of cases) if (!CASES[c]) throw new Error(`Unknown case "${c}"`);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** In the page: instrument the loop, switch things off, warm up, record the frames. */
async function record({ off, hide, warmupMs, ms }) {
  const st = window.__street;
  const loop = st.app.loop;
  const cpu = { render: 0 };
  for (const s of loop.systems) {
    cpu[s.name] = 0;
    const update = s.update.bind(s);
    s.update = (dt, f) => {
      const t = performance.now();
      update(dt, f);
      cpu[s.name] += performance.now() - t;
    };
    if (off.includes(s.name)) s.enabled = false;
  }
  const pipeline = st.app.pipeline;
  const render = pipeline.render.bind(pipeline);
  pipeline.render = () => {
    const t = performance.now();
    render();
    cpu.render += performance.now() - t;
  };
  if (hide === 'street') st.streetView.group.visible = false;
  if (hide === 'fx') {
    st.fx.rain.mesh.visible = false;
    st.fx.leaves.mesh.visible = false;
  }
  if (hide === 'near') {
    // Hidden again every frame: the chunks that stream in bring new near meshes
    const update = st.streetView.update.bind(st.streetView);
    const hideNear = () =>
      st.streetView.group.traverse((m) => {
        if (m.isMesh && m.material?.maskNode) m.visible = false;
      });
    st.streetView.update = (dt) => {
      update(dt);
      hideNear();
    };
    hideNear();
  } else if (hide && hide !== 'fx') {
    st.scene.getObjectByName(hide).visible = false;
  }
  const changes = [];
  const t0 = performance.now();
  st.bus.on('quality:changed', (e) =>
    changes.push(`${((performance.now() - t0) / 1000).toFixed(1)}s→${e.label}`),
  );
  await new Promise((r) => setTimeout(r, warmupMs));
  for (const k of Object.keys(cpu)) cpu[k] = 0;
  const z0 = st.taxi.z;
  const frames = [];
  let last = performance.now();
  const end = last + ms;
  await new Promise((done) => {
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const info = st.renderer.webgpuRenderer.info.render;
  const g = st.app.governor;
  const quality = st.store.get('render.autoQuality')
    ? `${st.app.tierName} · settled on ${g.rung.label} (${changes.join(', ') || 'no changes'})`
    : null;
  return {
    frames,
    cpu,
    drove: st.taxi.z - z0,
    calls: info.drawCalls,
    triangles: info.triangles,
    quality,
  };
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error('No Chrome found – set CHROME_PATH to a Chrome / Chromium binary.');
  const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
  await server.listen();
  const base = server.resolvedUrls.local[0];
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      // Frames as fast as the GPU draws them, not at the display's rate
      ...(args.vsync ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']),
      ...(args.gpu === 'high' ? ['--use-webgpu-power-preference=force-high-performance'] : []),
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.warn('  page error:', e.message));
    let adapter = null;
    for (const name of cases) {
      const c = CASES[name];
      await page.goto(`${base}?forge=0&render.autoQuality=false${c.query ? `&${c.query}` : ''}`);
      await page.waitForFunction(() => window.__street?.app?.loop, { timeout: 180_000 });
      adapter ??= await page.evaluate(async () => {
        const a = await navigator.gpu?.requestAdapter();
        const i = a?.info ?? {};
        return [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' ');
      });
      if (name === cases[0]) {
        console.log(
          `GPU: ${adapter || '?'} · ${width}×${height} · ${warmup} s warm-up, ${seconds} s`,
        );
      }
      const r = await page.evaluate(record, {
        off: c.off ?? [],
        hide: c.hide ?? null,
        warmupMs: (c.warmup ?? warmup) * 1000,
        ms: seconds * 1000,
      });
      const n = r.frames.length;
      const sorted = [...r.frames].sort((a, b) => a - b);
      const median = sorted[Math.floor(n / 2)];
      const p95 = sorted[Math.floor(n * 0.95)];
      const mean = r.frames.reduce((s, t) => s + t, 0) / n;
      const hitches = r.frames.filter((t) => t > 250);
      const cpu = Object.entries(r.cpu)
        .filter(([, v]) => v / n >= 0.05)
        .map(([k, v]) => `${k} ${(v / n).toFixed(2)}`)
        .join(', ');
      console.log(
        `${name.padEnd(10)} ${(1000 / median).toFixed(1).padStart(5)} FPS  median ${median.toFixed(1)} ms` +
          `  p95 ${p95.toFixed(1)}  mean ${mean.toFixed(1)}  hitches ${hitches.length}` +
          (hitches.length ? ` (max ${Math.max(...hitches).toFixed(0)} ms)` : '') +
          `  drove ${r.drove.toFixed(0)} m  ${r.calls} calls  ${(r.triangles / 1000).toFixed(0)}k tris`,
      );
      console.log(`${''.padEnd(10)} CPU ms/frame: ${cpu}`);
      if (r.quality) console.log(`${''.padEnd(10)} quality: ${r.quality}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
