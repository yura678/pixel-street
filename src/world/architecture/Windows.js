/**
 * Recessed sash windows (glazing, frame, sill, head, flower box, AC) and the
 * lit/unlit window seed picker shared with the atlas shader.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import {
  WHITE,
  CREAM_FRAME,
  STONE_CORNICE,
  LEAF_MID_OLIVE,
  LEAF_SAGE_GREEN,
  FABRICS,
} from './palette.js';
import { addLeafBlade } from './Greenery.js';
import { archRing, arcZY, extrudeZY, orientedTri } from './primitives.js';
import { buildWallAcCondenser, buildWindowAirConditioner } from './Services.js';

/**
 * Picks a window seed whose shader hash (`AtlasMaterial`: `fract(sin(seed·91.3)·43758.5)`)
 * keeps the room lit from golden hour on (`lit`) or dark until late night (`!lit`).
 * Leaves the choice to chance when `lit` is undefined.
 */
export function windowSeed(rng, lit) {
  if (lit === undefined || lit === null) return rng.next();
  // Emulate the GPU's float32 maths (rounding of `seed·91.3` alone moves the hash by ±0.3)
  // and only accept seeds whose hash stays on the wanted side for a few ulps of error in
  // the GPU's `sin`, so the choice holds on every driver.
  const f = Math.fround;
  const ok = (hash) => (lit ? hash > 0.86 : hash < 0.3);
  for (let i = 0; i < 256; i++) {
    const s = f(rng.next());
    const sn = f(Math.sin(f(s * f(91.3))));
    const ulp = 2 ** (Math.floor(Math.log2(Math.abs(sn) || 1e-30)) - 23);
    let robust = true;
    for (let k = -4; k <= 4 && robust; k++) {
      const v = f(f(sn + k * ulp) * f(43758.5453));
      robust = ok(v - Math.floor(v));
    }
    if (robust) return s;
  }
  return rng.next();
}

/**
 * One recessed sash window: painted dark reveal, glazing (tall 2:3 tile, never stretched)
 * with optional curtains/blind/sheer/stair glass (fabric colour via vertex tint), cream or
 * dark-stained frame, stone sill and a head. Optional window AC, flower box on the sill, or a
 * split AC condenser under the sill (`acBelow`).
 *
 * Heads (`lintel`): `cap` moulded cap (default), `flat` lintel, `casing` (boards round the
 * window of a frame house, with `trimTile: 'wood_paint'`), `hood` cornice hood on
 * consoles, `pediment` triangular pediment, `keystone` flat arch with keystone, `incised`
 * Neo-Grec lintel with ears and cut grooves, `stepped` Neo-Grec lintel stepped out in two
 * courses with a raised tablet, `eared` plain brownstone lintel with ears, `block`
 * massive rough-cut Romanesque lintel, `brow` eyebrow hood, and two that also shape
 * the glass: `segmental` (shallow curved top) and `arch` (round top, `wh` = height to the
 * spring line); `consoles` makes a curved head heavy, on two consoles (cast iron painted `hood`,
 * a colour, else stone), `voussoirs` (a brick
 * colour) builds it as a brick arch round a stone keystone, `rock` as deep rock-faced voussoirs
 * without one (Romanesque); `none` leaves the head bare. `lights` adds muntins: `1/1`, `2/2`, `6/6`, `6/9`, `8/8`, `12/12`,
 * `cross` (Dutch kruiskozijn), `qa` (Queen Anne border lights), `chicago`, `transom` (a heavy
 * transom bar, at the spring line of a round head: Romanesque). `shutters` (colour)
 * hangs louvred leaves open beside it, `guard` an iron grille in front (`antefix`: with
 * palmettes on top), `sillConsoles` sets the sill on two small angular consoles, `festoon`
 * hangs a carved swag under it. `tile` glazes it with a tile of its own, `glass` (a colour)
 * with plain dark glass; `blooms` (a colour) fills its flower box with one kind of flower.
 */
export function buildSashWindow(atlas, b, xFace, cz, y0, ww, wh, rng, opts = {}) {
  const T = atlas.tiles;
  const dark = opts.frame === 'dark';
  const frameCol = dark ? [0.2, 0.16, 0.13] : CREAM_FRAME;
  // Stone trim, or painted boards round the window of a frame house (`trimTile: 'wood_paint'`)
  const trimOpt = {
    tile: T[opts.trimTile ?? 'wall_stone'],
    color: opts.trim ?? STONE_CORNICE,
    texScale: opts.trimTile ? 0.6 : 0.9,
  };
  const glazing = opts.glazing ?? 'plain';
  const seed = windowSeed(rng, opts.lit);
  // A tile of its own (`tile`: Chicago window, tall parlor sashes – dressed in the flat's
  // fabric colour) or plain dark glass with no picture at all (`glass`: a colour)
  let tile =
    glazing === 'plain'
      ? dark
        ? T.win_plain_dark
        : opts.six
          ? T.win_six_cream
          : T.win_plain_cream
      : T[`win_${glazing}_${dark ? 'dark' : 'cream'}`];
  let tint = glazing === 'plain' ? WHITE : (opts.fabric ?? FABRICS.linen);
  if (opts.glass) {
    tile = T.white;
    tint = opts.glass;
  } else if (opts.tile) {
    tile = T[opts.tile];
    tint = opts.fabric ?? FABRICS.linen;
  }
  const curve = curvedHead(opts.lintel, cz, y0, ww, wh);
  const glassH = curve ? wh + curve.rise : wh;

  // Dark reveal recess behind the glazing
  b.quad([xFace - 0.02, y0 - 0.07, cz - ww * 0.5 - 0.06], [0, 0, ww + 0.12], [0, wh + 0.14, 0], {
    tile: T.white,
    color: [0.085, 0.09, 0.095],
  });
  b.quad([xFace - 0.028, y0, cz - ww * 0.5], [0, 0, ww], [0, wh, 0], {
    tile,
    color: tint,
    rep: curve ? [1, wh / glassH] : [1, 1],
    data: [seed, 0],
  });
  if (curve) {
    // Curved top: reveal and glass fans continue the same tile picture (uniform scale)
    const yc = y0 + wh;
    const glass = arcZY(curve.zc, curve.yc, curve.r, curve.a0, curve.a1, curve.n);
    const reveal = arcZY(curve.zc, curve.yc, curve.r + 0.06, curve.a0, curve.a1, curve.n);
    const uv = (z, y) => [(z - (cz - ww * 0.5)) / ww, (y - y0) / glassH];
    const revealOpt = { tile: T.white, color: [0.085, 0.09, 0.095] };
    const glassOpt = { tile, color: tint, data: [seed, 0] };
    for (let i = 0; i < curve.n; i++) {
      const [ra, rb] = [reveal[i], reveal[i + 1]];
      const [ga, gb] = [glass[i], glass[i + 1]];
      orientedTri(
        b,
        [xFace - 0.02, yc - 0.07, cz],
        [xFace - 0.02, ra[1], ra[0]],
        [xFace - 0.02, rb[1], rb[0]],
        [0, 0],
        [1, 0],
        [1, 1],
        [-1, 0, 0],
        revealOpt,
      );
      orientedTri(
        b,
        [xFace - 0.028, yc, cz],
        [xFace - 0.028, ga[1], ga[0]],
        [xFace - 0.028, gb[1], gb[0]],
        uv(cz, yc),
        uv(...ga),
        uv(...gb),
        [-1, 0, 0],
        glassOpt,
      );
    }
  }

  // Painted frame: head/bottom rails + stiles
  const fr = 0.058;
  b.box(xFace - 0.06, y0 - 0.065, cz, 0.06, fr, ww + 0.11, { tile: T.white, color: frameCol });
  b.box(xFace - 0.06, y0 + wh - 0.005, cz, 0.06, fr, ww + 0.11, { tile: T.white, color: frameCol });
  for (const sz of [-1, 1]) {
    b.box(xFace - 0.06, y0 - 0.02, cz + sz * (ww * 0.5 - fr * 0.5), 0.06, wh + 0.02, fr, {
      tile: T.white,
      color: frameCol,
    });
  }
  if (curve) {
    archRing(
      b,
      xFace - 0.09,
      xFace - 0.03,
      curve.zc,
      curve.yc,
      curve.r - fr,
      curve.r,
      curve.a0,
      curve.a1,
      curve.n,
      { tile: T.white, color: frameCol },
    );
  }
  if (opts.lights)
    buildMuntins(T, b, xFace, cz, y0, ww, wh, opts.lights, frameCol, curve ? glassH : wh);

  // Projecting stone sill, on two small angular consoles when `sillConsoles` (Neo-Grec)
  b.box(xFace - 0.085, y0 - 0.15, cz, 0.17, 0.1, ww + 0.22, trimOpt);
  if (opts.festoon) {
    // Carved festoon under the sill: a swag of stone beads between two short drops
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const fy = y0 - 0.27 - Math.sin(t * Math.PI) * 0.16;
      // Neighbouring beads overlap: every other one stands 4 mm prouder
      const bx = xFace - 0.035 - (i % 2) * 0.002;
      b.box(bx, fy, cz - ww * 0.4 + ww * 0.8 * t, 0.07 + (i % 2) * 0.004, 0.09, 0.11, trimOpt);
    }
    for (const s of [-1, 1])
      b.box(xFace - 0.035, y0 - 0.45, cz + s * ww * 0.44, 0.06, 0.24, 0.06, trimOpt);
  }
  if (opts.sillConsoles) {
    for (const sz of [-1, 1]) {
      const z = cz + sz * (ww * 0.5 + 0.02);
      b.box(xFace - 0.06, y0 - 0.33, z, 0.12, 0.18, 0.1, trimOpt);
      b.box(xFace - 0.04, y0 - 0.4, z, 0.08, 0.07, 0.07, trimOpt);
    }
  }

  // Window head
  if (opts.lintel === 'hood') {
    b.box(xFace - 0.05, y0 + wh + 0.03, cz, 0.1, 0.16, ww + 0.16, trimOpt);
    b.box(xFace - 0.11, y0 + wh + 0.19, cz, 0.22, 0.07, ww + 0.38, trimOpt);
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.08, y0 + wh - 0.06, cz + sz * (ww * 0.5 + 0.11), 0.12, 0.25, 0.08, trimOpt);
    }
  } else if (opts.lintel === 'flat') {
    b.box(xFace - 0.05, y0 + wh + 0.03, cz, 0.1, 0.17, ww + 0.2, trimOpt);
  } else if (opts.lintel === 'casing') {
    // Frame house: flat side casings standing on the sill, a head board with a little drip cap
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.03, y0 - 0.05, cz + sz * (ww * 0.5 + 0.1), 0.06, wh + 0.1, 0.12, trimOpt);
    }
    b.box(xFace - 0.03, y0 + wh + 0.05, cz, 0.06, 0.16, ww + 0.32, trimOpt);
    b.box(xFace - 0.06, y0 + wh + 0.21, cz, 0.12, 0.04, ww + 0.38, trimOpt);
  } else if (opts.lintel === 'block') {
    // Romanesque: a massive rough-cut lintel running well past the jambs, standing proud
    b.box(xFace - 0.06, y0 + wh + 0.03, cz, 0.12, 0.36, ww + 0.44, {
      tile: T.stone_rockfaced,
      color: opts.trim ?? STONE_CORNICE,
      texScale: 0.8,
    });
  } else if (opts.lintel === 'eared') {
    // Brownstone lintel with ears: the slab runs past the jambs and drops a short ear each side
    const lw = ww + 0.34;
    b.box(xFace - 0.06, y0 + wh + 0.03, cz, 0.12, 0.22, lw, trimOpt);
    b.box(xFace - 0.09, y0 + wh + 0.25, cz, 0.16, 0.05, lw + 0.06, trimOpt);
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.055, y0 + wh - 0.13, cz + sz * (lw * 0.5 - 0.07), 0.11, 0.16, 0.14, trimOpt);
    }
  } else if (curve && opts.rock) {
    // Romanesque: deep voussoirs of rock-faced stone, no keystone
    const ring = Math.min(0.24, 0.08 + curve.r * 0.2);
    // 5 mm prouder than the sash frame, whose head it overlaps at the springing
    archRing(
      b,
      xFace - 0.095,
      xFace + 0.02,
      curve.zc,
      curve.yc,
      curve.r + 0.03,
      curve.r + 0.03 + ring,
      curve.a0,
      curve.a1,
      curve.n + 1,
      { tile: T.stone_rockfaced, color: opts.trim ?? STONE_CORNICE, texScale: 0.6 },
    );
  } else if (curve && opts.voussoirs) {
    // Brick arch (Dutch Revival): voussoirs in two alternating brick shades round a light
    // stone keystone that stands proud at the crown
    const n = curve.n + (curve.n % 2 ? 0 : 1);
    const da = (curve.a1 - curve.a0) / n;
    for (let i = 0; i < n; i++) {
      if (i === n >> 1) continue;
      const shade = i % 2 ? 0.8 : 1;
      archRing(
        b,
        xFace - 0.07,
        xFace + 0.02,
        curve.zc,
        curve.yc,
        curve.r + 0.03,
        curve.r + 0.19,
        curve.a0 + da * i,
        curve.a0 + da * (i + 1),
        1,
        { tile: T.wall_stone, color: opts.voussoirs.map((c) => c * shade), texScale: 0.5 },
      );
    }
    b.box(xFace - 0.07, curve.yc + curve.r, cz, 0.12, 0.28, curve.r * da * 1.15 + 0.03, trimOpt);
  } else if (curve) {
    // Voussoirs round the curved head, keystone at the crown
    archRing(
      b,
      xFace - 0.08,
      xFace + 0.02,
      curve.zc,
      curve.yc,
      curve.r + 0.03,
      curve.r + 0.19,
      curve.a0,
      curve.a1,
      curve.n + (curve.n % 2 ? 0 : 1),
      trimOpt,
      true,
    );
    if (opts.consoles) {
      // Heavy hood: a projecting moulded arch over the voussoirs, carried on two consoles – in
      // the trim's stone, or cast iron painted `hood` (a colour)
      const hoodOpt = opts.hood ? { tile: T.metal, color: opts.hood } : trimOpt;
      archRing(
        b,
        xFace - 0.16,
        xFace - 0.06,
        curve.zc,
        curve.yc,
        curve.r + 0.19,
        curve.r + 0.27,
        curve.a0 - 0.06,
        curve.a1 + 0.06,
        curve.n,
        hoodOpt,
      );
      for (const sz of [-1, 1]) {
        b.box(xFace - 0.09, y0 + wh - 0.28, cz + sz * (ww * 0.5 + 0.14), 0.14, 0.34, 0.1, hoodOpt);
      }
    }
  } else if (opts.lintel === 'stepped') {
    // Neo-Grec: a flat lintel with ears, stepped out and up in two courses, a raised tablet in
    // the middle of the upper one; one machine-cut groove along the lower course
    const lw = ww + 0.3;
    const yl = y0 + wh + 0.03;
    b.box(xFace - 0.06, yl, cz, 0.12, 0.2, lw, trimOpt);
    b.box(xFace - 0.09, yl + 0.2, cz, 0.18, 0.08, lw + 0.12, trimOpt);
    b.box(xFace - 0.11, yl + 0.28, cz, 0.16, 0.07, ww * 0.42, trimOpt);
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.055, yl - 0.12, cz + sz * (lw * 0.5 - 0.06), 0.11, 0.12, 0.12, trimOpt);
    }
    const groove = { tile: T.white, color: (opts.trim ?? STONE_CORNICE).map((c) => c * 0.45) };
    b.quad(
      [xFace - 0.122, yl + 0.09, cz - lw * 0.5 + 0.12],
      [0, 0, lw - 0.24],
      [0, 0.016, 0],
      groove,
    );
  } else if (opts.lintel === 'pediment') {
    const yb = y0 + wh + 0.05;
    const hw = ww * 0.5 + 0.22;
    b.box(xFace - 0.05, y0 + wh + 0.02, cz, 0.1, 0.12, ww + 0.2, trimOpt);
    b.box(xFace - 0.1, yb + 0.09, cz, 0.2, 0.07, ww + 0.44, trimOpt);
    extrudeZY(
      b,
      xFace - 0.12,
      xFace + 0.01,
      [
        [cz - hw, yb + 0.16],
        [cz + hw, yb + 0.16],
        [cz, yb + 0.16 + hw * 0.36],
      ],
      trimOpt,
    );
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.08, y0 + wh - 0.12, cz + sz * (ww * 0.5 + 0.13), 0.12, 0.3, 0.08, trimOpt);
    }
  } else if (opts.lintel === 'keystone') {
    b.box(xFace - 0.05, y0 + wh + 0.03, cz, 0.1, 0.18, ww + 0.24, trimOpt);
    b.box(xFace - 0.09, y0 + wh + 0.01, cz, 0.1, 0.27, 0.2, trimOpt);
  } else if (opts.lintel === 'incised') {
    // Neo-Grec: massive lintel with ears and drops; grooves cut by machine
    const lw = ww + 0.46;
    b.box(xFace - 0.07, y0 + wh + 0.02, cz, 0.14, 0.27, lw, trimOpt);
    b.box(xFace - 0.1, y0 + wh + 0.29, cz, 0.18, 0.05, lw + 0.08, trimOpt);
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.06, y0 + wh - 0.16, cz + sz * (lw * 0.5 - 0.08), 0.12, 0.18, 0.16, trimOpt);
    }
    const groove = { tile: T.white, color: (opts.trim ?? STONE_CORNICE).map((c) => c * 0.45) };
    for (const gy of [0.08, 0.2]) {
      b.quad(
        [xFace - 0.142, y0 + wh + 0.02 + gy, cz - lw * 0.5 + 0.1],
        [0, 0, lw - 0.2],
        [0, 0.014, 0],
        groove,
      );
    }
    b.quad([xFace - 0.143, y0 + wh + 0.1, cz - 0.04], [0, 0, 0.08], [0, 0.08, 0], groove);
  } else if (opts.lintel === 'brow') {
    const R = ww * 0.9;
    const th = Math.asin((ww * 0.5 + 0.12) / R);
    const yc = y0 + wh + 0.06 - R * Math.cos(th);
    archRing(
      b,
      xFace - 0.1,
      xFace + 0.01,
      cz,
      yc,
      R,
      R + 0.08,
      Math.PI * 0.5 - th,
      Math.PI * 0.5 + th,
      7,
      trimOpt,
    );
  } else if (opts.lintel !== 'none') {
    b.box(xFace - 0.065, y0 + wh + 0.035, cz, 0.13, 0.13, ww + 0.2, trimOpt);
    b.box(xFace - 0.09, y0 + wh + 0.165, cz, 0.18, 0.05, ww + 0.32, trimOpt);
  }

  // Louvred shutters folded back against the wall, one leaf each side
  if (opts.shutters) {
    const lw = ww * 0.5 + 0.02;
    const h = curve ? wh : wh + 0.04;
    const louvre = { tile: T.shutter_wood, color: opts.shutters };
    for (const sz of [-1, 1]) {
      b.box(xFace - 0.025, y0 - 0.02, cz + sz * (ww * 0.5 + 0.17 + lw * 0.5), 0.04, h, lw, {
        ...louvre,
        faces: { nx: { ...louvre, rep: [1, Math.max(1, Math.round(h / (lw * 1.7)))] } },
      });
    }
  }
  // Iron window guard (frieze windows of Greek Revival houses); `antefix` crowns it with a row
  // of little cast-iron palmettes
  if (opts.guard) {
    b.quad([xFace - 0.1, y0, cz - ww * 0.5], [0, 0, ww], [0, wh, 0], {
      tile: T.balcony_iron,
      color: WHITE,
      rep: [Math.max(1, Math.round(ww / 0.3)), Math.max(1, Math.round(wh / 0.3))],
    });
    if (opts.guard === 'antefix') {
      const iron = { tile: T.metal, color: [0.13, 0.14, 0.15] };
      b.box(xFace - 0.1, y0 + wh, cz, 0.03, 0.025, ww + 0.04, iron);
      const n = Math.max(3, Math.round(ww / 0.15));
      for (let i = 0; i < n; i++) {
        const az = cz - ww * 0.5 + (ww * (i + 0.5)) / n;
        extrudeZY(
          b,
          xFace - 0.11,
          xFace - 0.09,
          [
            [az - 0.04, y0 + wh + 0.025],
            [az + 0.04, y0 + wh + 0.025],
            [az, y0 + wh + 0.11],
          ],
          iron,
        );
      }
    }
  }

  if (opts.ac) {
    buildWindowAirConditioner(atlas, b, xFace, y0 + 0.36, cz);
  }
  // Split-system condenser on brackets right under the sill of the room it cools
  if (opts.acBelow) {
    buildWallAcCondenser(atlas, b, xFace, y0 - 0.68, cz);
  }

  // Terracotta flower box with a spill of leaves and blooms
  if (opts.flowers) {
    const fy = y0 - 0.145;
    b.box(xFace - 0.17, fy - 0.03, cz, 0.2, 0.16, ww + 0.04, {
      tile: T.terracotta,
      color: [0.82, 0.62, 0.52],
      texScale: 0.5,
    });
    const bloomCols = [
      [0.95, 0.62, 0.72],
      [0.9, 0.36, 0.42],
      [0.96, 0.9, 0.84],
      [0.94, 0.72, 0.3],
    ];
    for (let i = -3; i <= 3; i++) {
      const fz = cz + i * (ww * 0.14);
      addLeafBlade(
        atlas,
        b,
        xFace - 0.21,
        fy + 0.14,
        fz,
        -0.5,
        0.42 + Math.abs(i) * 0.03,
        rng.range(-0.35, 0.35),
        rng.range(0.22, 0.3),
        0.1,
        0.04,
        rng.range(-0.3, 0.3),
        i % 2 === 0 ? LEAF_MID_OLIVE : LEAF_SAGE_GREEN,
        seed,
        0.3,
      );
      if (i % 2 === 0) {
        b.cylinderY(xFace - 0.215, fy + 0.17, fz, 0.07, 0.035, 0.08, 6, {
          tile: T.white,
          color: opts.blooms ?? bloomCols[(i + 3 + Math.floor(seed * 4)) % bloomCols.length],
          data: [seed, 0.3],
        });
      }
    }
  }
}

/**
 * Geometry of a curved window head, or null for a straight one. `arch`: semicircle on the
 * spring line `y0 + wh`; `segmental`: a shallow arc rising `0.16·ww` above it.
 */
function curvedHead(lintel, cz, y0, ww, wh) {
  if (lintel !== 'arch' && lintel !== 'segmental') return null;
  const half = ww * 0.5;
  const rise = lintel === 'arch' ? half : ww * 0.16;
  const r = (half * half + rise * rise) / (2 * rise);
  const th = Math.asin(Math.min(1, half / r));
  return {
    zc: cz,
    yc: y0 + wh + rise - r,
    r,
    rise,
    a0: Math.PI * 0.5 - th,
    a1: Math.PI * 0.5 + th,
    n: lintel === 'arch' ? 10 : 6,
  };
}

/** Glazing bars over the glass (`lights` pattern); `topH` = glass height incl. a curved top. */
function buildMuntins(T, b, xFace, cz, y0, ww, wh, lights, color, topH) {
  const o = { tile: T.white, color };
  const x = xFace - 0.04;
  const z0 = cz - ww * 0.5;
  const y1 = y0 + wh;
  const bar = 0.022;
  const v = (z, ya, yb, t = bar) => b.box(x, ya, z, 0.02, yb - ya, t, o);
  const h = (y, za = z0, zb = z0 + ww, t = bar) =>
    b.box(x, y - t * 0.5, (za + zb) * 0.5, 0.02, t, zb - za, o);
  const meet = (f) => b.box(xFace - 0.045, y0 + wh * f - 0.025, cz, 0.03, 0.05, ww, o);
  switch (lights) {
    case '1/1':
      meet(0.5);
      break;
    case '2/2':
      meet(0.5);
      v(cz, y0, y0 + topH);
      break;
    case '6/6':
      meet(0.5);
      v(z0 + ww / 3, y0, y1);
      v(z0 + (ww * 2) / 3, y0, y1);
      h(y0 + wh * 0.25);
      h(y0 + wh * 0.75);
      break;
    case '6/9':
      meet(0.6);
      v(z0 + ww / 3, y0, y1);
      v(z0 + (ww * 2) / 3, y0, y1);
      h(y0 + wh * 0.2);
      h(y0 + wh * 0.4);
      h(y0 + wh * 0.8);
      break;
    case '8/8':
      // Colonial Revival: four lights across, two high in each sash
      meet(0.5);
      for (const f of [0.25, 0.5, 0.75]) v(z0 + ww * f, y0, y1);
      h(y0 + wh * 0.25);
      h(y0 + wh * 0.75);
      break;
    case '12/12':
      // The tall ground-floor sashes: four across, three high in each
      meet(0.5);
      for (const f of [0.25, 0.5, 0.75]) v(z0 + ww * f, y0, y1);
      for (const f of [1 / 6, 1 / 3, 2 / 3, 5 / 6]) h(y0 + wh * f);
      break;
    case 'cross':
      v(cz, y0, y0 + topH, 0.05);
      h(y0 + wh * 0.62, z0, z0 + ww, 0.05);
      v(z0 + ww * 0.25, y0 + wh * 0.62, y1);
      v(z0 + ww * 0.75, y0 + wh * 0.62, y1);
      h(y0 + wh * 0.81);
      break;
    case 'qa':
      meet(0.5);
      v(z0 + ww * 0.2, y0 + wh * 0.5, y1);
      v(z0 + ww * 0.8, y0 + wh * 0.5, y1);
      h(y0 + wh * 0.82);
      break;
    case 'transom':
      // A heavy transom bar – at the spring line under a round head, else high in the window –
      // over sashes with a meeting rail and a centre bar
      if (topH > wh + 1e-6) {
        h(y1, z0, z0 + ww, 0.05);
        meet(0.5);
        v(cz, y0, y1);
      } else {
        h(y0 + wh * 0.78, z0, z0 + ww, 0.05);
        meet(0.39);
        v(cz, y0, y0 + wh * 0.78);
      }
      break;
    case 'chicago':
      // Two mullions between the fixed pane and the side sashes (`win_chicago`), the sashes'
      // meeting rails
      v(z0 + ww * 0.21, y0, y1, 0.05);
      v(z0 + ww * 0.79, y0, y1, 0.05);
      h(y0 + wh * 0.5, z0, z0 + ww * 0.21, 0.04);
      h(y0 + wh * 0.5, z0 + ww * 0.79, z0 + ww, 0.04);
      break;
    default:
      throw new Error(`Unknown window lights "${lights}"`);
  }
}
