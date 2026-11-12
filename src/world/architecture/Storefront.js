/**
 * Shopfronts (NPS Preservation Brief 11 anatomy): piers, plinth, glazing, transom,
 * fascia with the sign, awning and the shop door – the general small shopfront
 * (`buildStorefront`) of the redesigned houses (the bakery of № 114 among them), the workshop
 * front of a one-storey taxpayer (`buildWorkshopFront`), the Romanesque front under one wide
 * arch (`buildArchedShopfront`), and blade and vertical signs hung out over the sidewalk.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { WHITE, CHARCOAL_IRON, STONE_CORNICE, STONE_STEP } from './palette.js';
import { buildPanelledDoor } from './Doors.js';
import { archRing, arcZY, orientedQuad, orientedTri, tube } from './primitives.js';
import { HATCH_DEPTH, SHOP_DOOR } from './SpecPlanner.js';
import { buildBookCart, buildFlowerStand } from './Stalls.js';
import { windowSeed } from './Windows.js';

/** Gilding of a druggist's mortar and pestle. */
const GILT = Object.freeze([0.86, 0.66, 0.3]);
/** Type metal (lead, tin, antimony) of a printer's sort. */
const TYPE_METAL = Object.freeze([0.48, 0.5, 0.53]);

/**
 * Small shopfront for a ground floor shared with a door to the flats (bodega, barber,
 * laundry…): cast-iron piers, a panelled bulkhead under clear plate glass split into panes
 * that keep the glass tile's proportion, transom lights, the roll-down shutter box over the
 * glazing, a fascia with the sign, a canvas awning and an optional neon OPEN plaque. The shop
 * door sits at one end or in the middle between two runs of glazing, recessed into a little
 * lobby when `recessed`; `door: 'none'` is a second display front of a shop whose door is
 * elsewhere. The awning may be rolled up under the fascia (`awningRolled`); a blade sign
 * (`blade: { tile, r }`) can hang out over the door, above the fascia. `marquee` mounts the
 * sign in a projecting box framed by chase bulbs; `neonPanel` (a sign text) hangs a neon in
 * the glass; `pole` stands a lit barber's pole on the pier beside the door. `light` (a colour)
 * lights the glass from inside (a laundromat's fluorescent tubes), `glassSign` letters the
 * longest run of glass, `neonTile` (a tile) hangs a square neon picture in the glass beside the
 * door; `bulkhead` (metres) raises the bulkhead under narrow glass (a bar). A gallery front
 * leaves out the bulkhead (`bulkhead: false`), the
 * transom (`transom: false`) and the fascia board (`fascia: false` – the sign is metal letters
 * on the wall, tinted `wallColor`), with one pane per run (`panes: 1`). A bistro's awning is
 * one plain colour (`awningTile: 'white'`) with a scalloped valance (`scallop`); `awningArms`
 * shows the folding arms of a retractable awning under its canvas.
 *
 * A 1930s front (a printer's) is framed in aluminium (`frame: 'metal'`, `paint` its colour) on a
 * polished granite bulkhead (`bulkheadColor`), with a pair of glass doors (`doors: 2`,
 * `glassDoor`); `sort` hangs a printer's type sort over the door instead of a blade sign. A
 * druggist's gilt mortar and pestle (`mortar`) hangs over the door on an iron bracket. When the
 * door is `recessed` the house mass must be cut for its lobby (`cut` in the spec,
 * `SpecPlanner`), else the wall hides it.
 *
 * A café may set a wooden bench along its first run (`bench`) and open a service hatch in the
 * middle pane of its last run (`hatch`); a news kiosk stands its racks of papers before every run
 * (`racks`) under a narrow awning (`awningReach`, metres out from the wall; 1 by default). A
 * bookshop parks its cart of books before the longest run (`cart`), a florist stands a stepped
 * stand of buckets of flowers before every run (`flowerStand`). `transomPanes` divides the
 * transom lights into small panes. A bakery's door has narrow side lights (`sidelights`) and two
 * swan-neck lamps wash its sign (`signLamps`).
 *
 * @param {object} o `{ x, z0, z1, top = 3.45, door: 'left'|'right'|'center'|'none', recessed,
 *   doors: 1|2, glassDoor, sidelights, frame: 'metal', bulkheadColor, paint, sign, signLamps,
 *   awning: colour | null, awningRolled, awningTile, scallop, awningArms, shutterBox, neon, blade,
 *   sort, mortar, marquee, neonPanel, pole, light, glassSign, transomPanes, cart, flowerStand,
 *   standPaint, glow: pool colour }`
 * @returns {[number, number] | null} lot-local Z span of the shop door (keep clear on the
 *   sidewalk), null without a door
 */
export function buildStorefront(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1 } = o;
  const top = o.top ?? 3.45;
  const paint = o.paint ?? [0.16, 0.24, 0.2];
  const frame =
    o.frame === 'metal'
      ? { tile: T.metal, color: paint }
      : { tile: T.wood_paint, color: paint, texScale: 0.6 };
  const fasciaY0 = top - 0.78;
  const glassTop = fasciaY0 - (o.shutterBox ? 0.36 : 0.06);
  const cz = (z0 + z1) * 0.5;

  // Piers and the fascia board with the sign
  for (const pz of [z0 + 0.1, z1 - 0.1]) b.box(x - 0.08, 0, pz, 0.16, fasciaY0, 0.2, frame);
  if (o.fascia !== false) {
    b.box(x - 0.07, fasciaY0, cz, 0.14, top - fasciaY0 - 0.06, z1 - z0, frame);
    b.box(x - 0.11, top - 0.08, cz, 0.18, 0.08, z1 - z0 + 0.06, frame);
  }
  const sign = o.sign && atlas.signs.get(o.sign);
  if (sign && o.marquee) {
    buildMarquee(atlas, b, x, cz, fasciaY0, top - fasciaY0 - 0.06, sign, paint);
  } else if (sign && o.fascia === false) {
    // No fascia board: the letters are fixed straight to the wall over the glass
    const sh = Math.min(0.42, top - fasciaY0 - 0.2);
    b.quad([x - 0.005, fasciaY0 + 0.14, cz - sh * 1.5], [0, 0, sh * 3], [0, sh, 0], {
      tile: sign,
      color: o.wallColor ?? WHITE,
    });
  } else if (sign) {
    const sh = Math.min(0.58, top - fasciaY0 - 0.18);
    b.box(x - 0.155, fasciaY0 + 0.06, cz, 0.03, sh, sh * 3, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: sign, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }
  if (o.shutterBox) {
    // Housing of the roll-down security shutter, painted to match
    b.box(x - 0.13, glassTop + 0.02, cz, 0.26, 0.3, z1 - z0 - 0.38, {
      tile: T.shutter,
      color: paint.map((c) => c * 1.4),
      texScale: 0.5,
    });
  }

  // Shop door at one end of the front or in the middle, in a shallow lobby when recessed
  const dw = o.doors === 2 ? SHOP_DOOR.double : SHOP_DOOR.single;
  const door = o.door ?? 'left';
  const left = door === 'left';
  const noDoor = door === 'none';
  // Narrow side lights either side of the door (`sidelights`) widen the door's bay
  const side = o.sidelights && !noDoor ? 0.3 : 0;
  const du = dw * 0.5 + side;
  const dz =
    door === 'center' ? cz : left ? z0 + 0.2 + du + SHOP_DOOR.side : z1 - 0.2 - du - SHOP_DOOR.side;
  const depth = o.recessed && !noDoor ? SHOP_DOOR.lobby : 0;
  if (depth) {
    // Floor and head of the lobby run 3 mm out past the facade plane (the wall mass meets them)
    b.box(x + depth * 0.5 - 0.0015, 0, dz, depth + 0.003, 0.04, dw + 0.12, {
      tile: T.wall_stone,
      color: STONE_STEP,
      texScale: 0.6,
    });
    b.box(x + depth * 0.5 - 0.0015, glassTop - 0.04, dz, depth + 0.003, 0.06, dw + 0.12, frame);
    for (const s of [-1, 1]) {
      const wz = dz + s * (dw * 0.5 + 0.06);
      // Side glass of the lobby, facing into it
      orientedQuad(
        b,
        [x, 0.34, wz],
        [x + depth, 0.34, wz],
        [x + depth, glassTop - 0.06, wz],
        [x, glassTop - 0.06, wz],
        [0, 0, -s],
        {
          tile: T.glass_panel,
          color: WHITE,
          data: [1.6, 0],
        },
      );
    }
  }
  if (!noDoor && o.glassDoor) {
    buildGlassDoors(atlas, b, {
      x: x + depth,
      z: dz,
      w: dw,
      h: Math.min(2.3, glassTop - 0.1),
      top: glassTop,
      frame,
      leaves: o.doors,
    });
  } else if (!noDoor) {
    buildPanelledDoor(atlas, b, x + depth, 0.04, dz, dw, Math.min(2.2, glassTop - 0.1), paint, {
      glazed: true,
      glow: 1.8,
      paint: true,
      double: o.doors === 2,
    });
  }

  // Display glazing: bulkhead, panes in slim frames, transom lights above – one run beside a
  // door at the end, two either side of a door in the middle, one across a front without one
  const runs = noDoor
    ? [[z0 + 0.2, z1 - 0.2]]
    : door === 'center'
      ? [
          [z0 + 0.2, dz - du - 0.06],
          [dz + du + 0.06, z1 - 0.2],
        ]
      : [left ? [dz + du + 0.06, z1 - 0.2] : [z0 + 0.2, dz - du - 0.06]];
  // A low bulkhead under the glass (or as high as `bulkhead` says: a bar's narrow glass) and
  // transom lights over it, unless left out
  const bulk = o.bulkhead === false ? 0.06 : typeof o.bulkhead === 'number' ? o.bulkhead : 0.42;
  const transom = o.transom === false ? 0 : 0.3;
  const glassH = glassTop - bulk - transom - 0.06;
  if (side) {
    // Side lights: a panel at the bulkhead's height, glass up to the door head, posts between
    const doorTop = 0.04 + Math.min(2.2, glassTop - 0.1);
    for (const s of [-1, 1]) {
      const sz = dz + s * (dw * 0.5 + side * 0.5);
      b.box(x - 0.05, 0, sz, 0.1, bulk, side, frame);
      b.quad(
        [x - 0.03, bulk + 0.04, sz - side * 0.5 + 0.04],
        [0, 0, side - 0.08],
        [0, doorTop - bulk - 0.08, 0],
        { tile: T.glass_panel, color: WHITE, data: [1.8, 0] },
      );
      b.box(x - 0.06, bulk, sz, 0.1, 0.04, side, frame);
      b.box(x - 0.06, 0, dz + s * (du + 0.03), 0.12, doorTop, 0.06, frame);
    }
    b.box(x - 0.06, doorTop - 0.02, dz, 0.12, 0.06, du * 2 + 0.12, frame);
  }
  // The bulkhead in the frame's paint, or polished granite (`bulkheadColor`): smooth, no joints
  const bulkMat = o.bulkheadColor ? { tile: T.white, color: o.bulkheadColor } : frame;
  for (const [ri, [g0, g1]] of runs.entries()) {
    const panes = o.panes ?? Math.max(1, Math.round((g1 - g0) / (glassH * 0.85)));
    const pw = (g1 - g0) / panes;
    b.box(x - 0.05, 0, (g0 + g1) * 0.5, 0.1, bulk, g1 - g0, bulkMat);
    b.box(x - 0.09, bulk, (g0 + g1) * 0.5, 0.16, 0.04, g1 - g0 + 0.04, frame);
    for (let i = 0; i < panes; i++) {
      const pz0 = g0 + i * pw;
      // Plain glass (kept unlit), or lit from inside in the colour of `light`
      const glass = {
        tile: T.shop_glass,
        color: o.light ?? WHITE,
        rep: [1, 1],
        // The display lit with the flats upstairs (dark on a sunny day, warm from golden hour on)
        data: [o.light ? 6.0 : windowSeed(rng, true), 0],
      };
      if (o.hatch && ri === runs.length - 1 && i === panes >> 1) {
        // A café's service hatch in the middle pane of the last run: the glass round it, the
        // opening with its shelf and the sash pushed up
        buildServiceHatch(atlas, b, {
          x,
          z0: pz0 + 0.03,
          w: pw - 0.06,
          y0: bulk + 0.04,
          h: glassH,
          glass,
          frame,
        });
      } else {
        b.quad([x - 0.03, bulk + 0.04, pz0 + 0.03], [0, 0, pw - 0.06], [0, glassH, 0], glass);
      }
      if (transom) {
        b.quad(
          [x - 0.03, bulk + glassH + 0.1, pz0 + 0.03],
          [0, 0, pw - 0.06],
          [0, transom - 0.06, 0],
          {
            tile: T.glass_panel,
            color: o.light ?? WHITE,
            data: [o.light ? 6.0 : 1.8, 0],
          },
        );
        if (o.transomPanes) {
          // Small square lights: glazing bars across the transom every ~0.2 m
          const tn = Math.max(2, Math.round((pw - 0.06) / 0.2));
          for (let k = 1; k < tn; k++) {
            const tz = pz0 + 0.03 + ((pw - 0.06) * k) / tn;
            b.box(x - 0.045, bulk + glassH + 0.1, tz, 0.03, transom - 0.06, 0.025, frame);
          }
        }
      }
      if (i > 0) b.box(x - 0.06, bulk, pz0, 0.1, glassTop - bulk, 0.06, frame);
    }
    b.box(x - 0.06, bulk + glassH + 0.04, (g0 + g1) * 0.5, 0.1, 0.06, g1 - g0, frame);
  }
  // A narrow wooden bench along the first run (a café's take-away customers), the news racks
  // standing before every run of a kiosk
  if (o.bench) buildWallBench(atlas, b, { x, z0: runs[0][0] + 0.08, z1: runs[0][1] - 0.08 });
  if (o.racks) {
    for (const [r0, r1] of runs) buildNewsRack(atlas, b, { x, z0: r0 + 0.04, z1: r1 - 0.04 });
  }
  if (o.cart) {
    const [c0, c1] = runs.reduce((a, r) => (r[1] - r[0] > a[1] - a[0] ? r : a));
    buildBookCart(atlas, b, { x, z: (c0 + c1) * 0.5, len: Math.min(1.3, c1 - c0 - 0.5) });
  }
  if (o.flowerStand) {
    for (const [r0, r1] of runs) {
      buildFlowerStand(atlas, b, rng, { x, z0: r0 + 0.04, z1: r1 - 0.04, paint: o.standPaint });
    }
  }
  const [g0, g1] = runs[runs.length - 1];
  if (o.neon) {
    const nz = left ? g1 - 0.45 : g0 + 0.45;
    b.box(x - 0.06, bulk + glassH * 0.55, nz, 0.02, 0.24, 0.36, {
      tile: T.metal,
      color: WHITE,
      faces: { nx: { tile: T.open_plaque, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }
  const lettering = o.glassSign && atlas.signs.get(o.glassSign);
  if (lettering) {
    // Sign-writer's letters on the middle pane of the longest run, lit with the window behind:
    // glowing with a lit shop's light, else dark glass by day like the rest of the window
    const [l0, l1] = runs.reduce((a, r) => (r[1] - r[0] > a[1] - a[0] ? r : a));
    const panes = Math.max(1, Math.round((l1 - l0) / (glassH * 0.85)));
    const pw = (l1 - l0) / panes;
    const lz = l0 + pw * (Math.floor(panes / 2) + 0.5);
    const lw = Math.min(1.8, pw - 0.3);
    b.quad([x - 0.035, bulk + glassH * 0.58, lz - lw * 0.5], [0, 0, lw], [0, lw / 3, 0], {
      tile: lettering,
      color: o.light ?? WHITE,
      data: [o.light ? 6.0 : windowSeed(rng, false), 0],
    });
  }
  const panel = o.neonPanel && atlas.signs.get(o.neonPanel);
  if (panel) {
    // Neon tubes on a dark backing board (3:1), hung on two wires in the middle of the glass
    const pw = Math.min(1.05, g1 - g0 - 0.4);
    const pz = (g0 + g1) * 0.5;
    const py = bulk + glassH * 0.5;
    b.box(x - 0.065, py, pz, 0.02, pw / 3, pw, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: panel, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
    for (const s of [-1, 1]) {
      b.box(x - 0.065, py + pw / 3, pz + s * pw * 0.35, 0.006, glassH * 0.5 - pw / 3, 0.006, {
        tile: T.metal,
        color: CHARCOAL_IRON,
      });
    }
  }
  const picture = o.neonTile && T[o.neonTile];
  if (picture) {
    // A neon picture (square) hung on two wires in the middle pane of the glass beside the door
    // (of two, the right-hand one), clear of the mullions; it lights up at dusk with the lamps
    const panes = o.panes ?? Math.max(1, Math.round((g1 - g0) / (glassH * 0.85)));
    const pw = (g1 - g0) / panes;
    const ps = Math.min(0.62, pw - 0.3, glassH * 0.5);
    const pz = g0 + pw * (Math.floor(panes / 2) + 0.5);
    const py = bulk + glassH * 0.42;
    b.box(x - 0.065, py, pz, 0.02, ps, ps, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: picture, color: WHITE, rep: [1, 1], data: [0, 0] } },
    });
    for (const s of [-1, 1]) {
      b.box(x - 0.065, py + ps, pz + s * ps * 0.35, 0.006, glassH * 0.58 - ps, 0.006, {
        tile: T.metal,
        color: CHARCOAL_IRON,
      });
    }
  }
  if (o.pole && !noDoor) {
    // On the pier at the door's end of the front, at head height
    buildBarberPole(atlas, b, { x: x - 0.16, z: door === 'right' ? z1 - 0.1 : z0 + 0.1, y: 1.6 });
  }

  // Canvas awning over the glazing, valance at its front edge – or rolled up in its roller
  // under the fascia, the folded arms tucked in at the ends
  if (o.awning && o.awningRolled) {
    const aw = { tile: T.awning, color: o.awning };
    const yR = fasciaY0 - 0.05;
    tube(b, x - 0.12, yR, z0 + 0.12, x - 0.12, yR, z1 - 0.12, 0.075, 0.075, 8, aw);
    b.box(x - 0.2, yR - 0.16, cz, 0.02, 0.12, z1 - z0 - 0.3, { ...aw, data: [0, 0.2] });
    for (const az of [z0 + 0.16, z1 - 0.16]) {
      b.box(x - 0.06, yR - 0.06, az, 0.12, 0.12, 0.06, { tile: T.metal, color: CHARCOAL_IRON });
    }
  } else if (o.awning) {
    const awZ0 = z0 + 0.05;
    const awZ1 = z1 - 0.05;
    // Striped canvas, or one plain colour (`awningTile`)
    const aw = {
      tile: o.awningTile ? T[o.awningTile] : T.awning,
      color: o.awning,
      rep: [Math.max(1, Math.round((awZ1 - awZ0) / 0.6)), 1],
    };
    const yA = fasciaY0 - 0.02;
    // A narrower awning (`awningReach`) keeps the canvas's pitch: it reaches out and drops less
    const cut = 1 - (o.awningReach ?? 1.0);
    const xA = x - 1.0 + cut;
    const yE = yA - 0.42 + cut * 0.42;
    b.prism(
      [x - 0.05, yA, awZ0],
      [x - 0.05, yA, awZ1],
      [xA, yE, awZ1],
      [xA, yE, awZ0],
      [x - 0.05, yA, awZ0],
      [x - 0.05, yA, awZ1],
      [xA, yE, awZ1],
      [xA, yE, awZ0],
      aw,
    );
    if (o.scallop) {
      // Scalloped valance: a narrow band with a row of half-round tabs hanging from it
      const val = { ...aw, rep: undefined, data: [0, 0.45] };
      b.box(x - 1.0, yA - 0.5, (awZ0 + awZ1) * 0.5, 0.03, 0.08, awZ1 - awZ0, {
        ...aw,
        data: [0, 0.45],
      });
      const n = Math.max(3, Math.round((awZ1 - awZ0) / 0.22));
      const r = (awZ1 - awZ0) / n / 2;
      for (let i = 0; i < n; i++) {
        const zc = awZ0 + r * (2 * i + 1);
        const arc = arcZY(zc, yA - 0.5, r, Math.PI, Math.PI * 2, 4);
        for (const s of [-1, 1]) {
          const fx = x - 1.0 + s * 0.015;
          for (let k = 0; k < 4; k++) {
            orientedTri(
              b,
              [fx, yA - 0.5, zc],
              [fx, arc[k][1], arc[k][0]],
              [fx, arc[k + 1][1], arc[k + 1][0]],
              [0.5, 1],
              [0.5 + (arc[k][0] - zc) / (r * 2), 0.5],
              [0.5 + (arc[k + 1][0] - zc) / (r * 2), 0.5],
              [s, 0, 0],
              val,
            );
          }
        }
      }
    } else {
      b.box(xA, yA - 0.6 + cut * 0.42, (awZ0 + awZ1) * 0.5, 0.03, 0.18, awZ1 - awZ0, {
        ...aw,
        data: [0, 0.45],
      });
    }
    if (o.awningArms) {
      // Folding arms of a retractable awning under the canvas: a shoulder bracket on the wall,
      // the two halves meeting at an elbow folded in toward the middle, the front bar along the
      // canvas edge behind the valance
      const iron = { tile: T.metal, color: CHARCOAL_IRON };
      const yS = yA - 0.3;
      const xF = x - 0.94;
      const yF = yA - 0.46;
      for (const [az, s] of [
        [awZ0 + 0.18, 1],
        [awZ1 - 0.18, -1],
      ]) {
        const ex = (x - 0.06 + xF) * 0.5;
        const ey = (yS + yF) * 0.5 - 0.02;
        const ez = az + s * 0.32;
        b.box(x - 0.03, yS - 0.09, az, 0.06, 0.18, 0.09, iron);
        tube(b, x - 0.06, yS, az, ex, ey, ez, 0.018, 0.018, 4, iron);
        tube(b, ex, ey, ez, xF, yF, az, 0.016, 0.016, 4, iron);
        b.box(ex, ey - 0.03, ez, 0.06, 0.06, 0.06, iron);
      }
      tube(b, xF, yF, awZ0 + 0.06, xF, yF, awZ1 - 0.06, 0.022, 0.022, 4, iron);
    }
  }

  if (o.blade) {
    const r = o.blade.r ?? 0.42;
    buildBladeSign(atlas, b, { x, z: dz, y: top + 0.3 + r, r, tile: o.blade.tile });
  }
  // A printer's type sort and a druggist's mortar, hung over the door (`y`: the bracket arm)
  if (o.sort) buildTypeSortSign(atlas, b, { x, z: dz, y: o.sort.y });
  if (o.mortar) buildMortarSign(atlas, b, { x, z: dz, y: o.mortar.y });

  // Swan-neck lamps over the fascia, washing the sign
  if (o.signLamps) {
    for (const s of [-1, 1]) {
      const lz = cz + s * 1.25;
      b.box(x - 0.22, top + 0.1, lz, 0.44, 0.04, 0.04, { tile: T.metal, color: CHARCOAL_IRON });
      b.cylinderY(x - 0.44, top - 0.02, lz, 0.1, 0.05, 0.12, 8, {
        tile: T.metal,
        color: CHARCOAL_IRON,
      });
      b.cylinderY(x - 0.44, top - 0.05, lz, 0.07, 0.07, 0.03, 8, {
        tile: T.bulb,
        color: WHITE,
        data: [2.5, 0],
      });
    }
  }

  return noDoor ? null : [dz - du - 0.4, dz + du + 0.4];
}

/**
 * Glass shop doors in a metal frame (a 1930s front): the dark opening, for every leaf its stiles
 * and rails, one tall pane and a push bar; over them a transom bar and a glass light up to the
 * head of the display glazing (`top`), so the frame runs on unbroken over the door.
 *
 * @param {object} o `{ x: the door's face, z, w, h, top, frame: MeshBuilder options, leaves }`
 */
function buildGlassDoors(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, w, h, top, frame } = o;
  const n = o.leaves === 2 ? 2 : 1;
  const lw = w / n;
  b.quad([x - 0.006, 0, z - w * 0.5 - 0.04], [0, 0, w + 0.08], [0, top - 0.02, 0], {
    tile: T.white,
    color: [0.08, 0.075, 0.07],
  });
  const glass = { tile: T.glass_panel, color: WHITE, data: [1.8, 0] };
  for (let i = 0; i < n; i++) {
    const lz = z - w * 0.5 + (i + 0.5) * lw;
    for (const s of [-1, 1]) {
      b.box(x - 0.03, 0.04, lz + s * (lw * 0.5 - 0.03), 0.05, h - 0.04, 0.06, frame);
    }
    b.box(x - 0.03, 0.04, lz, 0.05, 0.16, lw - 0.12, frame);
    b.box(x - 0.03, h - 0.06, lz, 0.05, 0.06, lw - 0.12, frame);
    b.quad([x - 0.032, 0.2, lz - lw * 0.5 + 0.06], [0, 0, lw - 0.12], [0, h - 0.26, 0], glass);
    // Push bar on two standoffs
    b.box(x - 0.09, 1.0, lz, 0.03, 0.045, lw - 0.3, { tile: T.metal, color: [0.9, 0.92, 0.94] });
    for (const s of [-1, 1])
      b.box(x - 0.065, 0.995, lz + s * (lw * 0.5 - 0.17), 0.05, 0.055, 0.03, frame);
  }
  // Transom bar, the light over the doors and the head
  b.box(x - 0.04, h, z, 0.08, 0.07, w + 0.08, frame);
  if (top - h > 0.3) {
    b.quad([x - 0.032, h + 0.07, z - w * 0.5], [0, 0, w], [0, top - h - 0.11, 0], glass);
    b.box(x - 0.04, top - 0.05, z, 0.08, 0.06, w + 0.08, frame);
  }
}

/**
 * A café's service hatch cut into one pane of its window (`z0`, `w`, `y0`, `h`: the pane's glass):
 * the glass round the opening keeps the pane's picture (cut, never stretched), warm light deep
 * inside, painted reveals, a little shelf at the sill with two paper cups on it, and the lower
 * sash pushed up in front of the glass above.
 */
function buildServiceHatch(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z0, w, y0, h, glass, frame } = o;
  const hw = Math.min(0.8, w - 0.3);
  const hz0 = z0 + (w - hw) * 0.5;
  const hz1 = hz0 + hw;
  const cz = (hz0 + hz1) * 0.5;
  const hy0 = 1.0;
  const hy1 = Math.min(y0 + h * 0.5, hy0 + 0.66);
  const piece = (za, zb, ya, yb) =>
    b.quad([x - 0.03, ya, za], [0, 0, zb - za], [0, yb - ya, 0], {
      ...glass,
      rep: [(zb - za) / w, (yb - ya) / h],
      uvOffset: [(za - z0) / w, (ya - y0) / h],
    });
  piece(z0, z0 + w, y0, hy0);
  piece(z0, z0 + w, hy1, y0 + h);
  piece(z0, hz0, hy0, hy1);
  piece(hz1, z0 + w, hy0, hy1);

  // The opening: reveals in the frame's paint running in to the lit counter at the back, just in
  // front of the back of the cut in the wall (`SpecPlanner`)
  const depth = HATCH_DEPTH - 0.02;
  // Warm light only: a corner of the shop-glass tile clear of its sky reflections, lit like a
  // shop interior
  b.quad([x + depth, hy0, hz0], [0, 0, hw], [0, hy1 - hy0, 0], {
    tile: T.shop_glass,
    color: WHITE,
    rep: [0.28, 0.12],
    uvOffset: [0.02, 0.86],
    data: [1.8, 0],
  });
  const reveal = { ...frame, rep: undefined };
  for (const [zr, s] of [
    [hz0, 1],
    [hz1, -1],
  ]) {
    orientedQuad(
      b,
      [x - 0.03, hy0, zr],
      [x + depth, hy0, zr],
      [x + depth, hy1, zr],
      [x - 0.03, hy1, zr],
      [0, 0, s],
      reveal,
    );
  }
  orientedQuad(
    b,
    [x - 0.03, hy1, hz0],
    [x + depth, hy1, hz0],
    [x + depth, hy1, hz1],
    [x - 0.03, hy1, hz1],
    [0, -1, 0],
    reveal,
  );
  orientedQuad(
    b,
    [x - 0.03, hy0, hz0],
    [x + depth, hy0, hz0],
    [x + depth, hy0, hz1],
    [x - 0.03, hy0, hz1],
    [0, 1, 0],
    reveal,
  );

  // Shelf on two brackets, two cups waiting on it
  b.box(x - 0.13, hy0 - 0.048, cz, 0.3, 0.045, hw + 0.16, frame);
  for (const bz of [hz0 + 0.06, hz1 - 0.06])
    b.box(x - 0.09, hy0 - 0.2, bz, 0.14, 0.155, 0.03, frame);
  for (const cupZ of [cz - 0.12, cz + 0.06]) {
    b.cylinderY(x - 0.16, hy0, cupZ, 0.032, 0.04, 0.09, 6, {
      tile: T.white,
      color: [0.95, 0.93, 0.88],
    });
    b.cylinderY(x - 0.16, hy0 + 0.09, cupZ, 0.043, 0.043, 0.018, 6, {
      tile: T.white,
      color: [0.32, 0.22, 0.16],
    });
  }

  // The window's stiles and the lower sash pushed up: its bottom rail is the opening's head
  const sashTop = Math.min(y0 + h - 0.04, hy1 + (hy1 - hy0));
  for (const sz of [hz0 - 0.025, hz1 + 0.025]) {
    b.box(x - 0.055, hy0, sz, 0.05, sashTop - hy0, 0.05, frame);
  }
  b.box(x - 0.055, hy1 - 0.02, cz, 0.05, 0.05, hw + 0.1, frame);
  b.box(x - 0.055, sashTop - 0.05, cz, 0.05, 0.05, hw + 0.1, frame);
}

/**
 * A narrow wooden bench along the shop window (`z0..z1`): two slats on iron trestles, clear of
 * the window's sill moulding.
 */
function buildWallBench(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z0, z1 } = o;
  const wood = { tile: T.wood, color: WHITE, texScale: 0.5 };
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const cz = (z0 + z1) * 0.5;
  for (const sx of [x - 0.25, x - 0.4]) b.box(sx, 0.44, cz, 0.13, 0.04, z1 - z0, wood);
  for (const lz of [z0 + 0.1, z1 - 0.1]) {
    b.box(x - 0.45, 0, lz, 0.04, 0.44, 0.04, iron);
    b.box(x - 0.21, 0, lz, 0.04, 0.44, 0.04, iron);
    b.box(x - 0.33, 0.4, lz, 0.28, 0.04, 0.05, iron);
  }
}

/**
 * A news kiosk's rack on the sidewalk before its window (`z0..z1`): a low wooden cabinet, the
 * display face sloping back from it – magazines over folded papers (`news_rack`, its 2:1 kept:
 * the slope is as long as half the rack is wide) – a lip at its foot and the back board.
 */
function buildNewsRack(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z0, z1 } = o;
  const wR = z1 - z0;
  const cz = (z0 + z1) * 0.5;
  const wood = { tile: T.wood, color: WHITE, texScale: 0.5 };
  const nU = Math.max(1, Math.round(wR / 1.3));
  const L = wR / nU / 2;
  const a = (55 * Math.PI) / 180;
  const dx = L * Math.cos(a);
  const dy = L * Math.sin(a);
  const xb = x - 0.16;
  const xf = xb - dx;
  const hf = 0.45;
  b.box((xf + x - 0.12) * 0.5, 0, cz, x - 0.12 - xf, hf, wR, { ...wood, faces: { ny: false } });
  b.box(xb + 0.02, hf, cz, 0.04, dy + 0.04, wR, wood);
  orientedQuad(b, [xf, hf, z0], [xf, hf, z1], [xb, hf + dy, z1], [xb, hf + dy, z0], [-dy, dx, 0], {
    tile: T.news_rack,
    color: WHITE,
    rep: [nU, 1],
  });
  for (const [z, s] of [
    [z0, -1],
    [z1, 1],
  ]) {
    orientedTri(
      b,
      [xf, hf, z],
      [xb, hf, z],
      [xb, hf + dy, z],
      [0, 0],
      [dx / 0.5, 0],
      [dx / 0.5, dy / 0.5],
      [0, 0, s],
      wood,
    );
  }
  b.box(xf - 0.01, hf - 0.02, cz, 0.04, 0.08, wR + 0.02, wood);
}

/**
 * A printer's sign: an outsize type sort hung on a wrought-iron bracket over the door, its body of
 * grey type metal running out from the wall with the nicks cut along its sides, the letter A
 * standing in relief on its face towards the street. `y` is the bracket arm.
 *
 * @param {object} o `{ x: wall face, z, y, len = 0.62, h = 0.36, d = 0.26 }`
 */
export function buildTypeSortSign(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const len = o.len ?? 0.62;
  const h = o.h ?? 0.36;
  const d = o.d ?? 0.26;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const metal = { tile: T.metal, color: TYPE_METAL };
  const x0 = x - 0.18;
  const x1 = x0 - len;
  const tip = x1 - 0.08;
  // Wall plate, the arm with its stay and a curl at the tip, two hangers
  b.box(x - 0.02, y - 0.3, z, 0.04, 0.42, 0.12, iron);
  b.box((x + tip) * 0.5, y, z, x - tip, 0.04, 0.035, iron);
  tube(b, x - 0.02, y - 0.27, z, x0 - len * 0.35, y, z, 0.013, 0.013, 4, iron);
  b.box(tip, y - 0.06, z, 0.04, 0.1, 0.035, iron);
  const yTop = y - 0.1;
  for (const t of [0.18, 0.82]) b.box(x0 - len * t, yTop, z, 0.02, 0.1, 0.02, iron);
  // The body, and the nicks along both sides near its foot
  const yc = yTop - h * 0.5;
  b.box((x0 + x1) * 0.5, yTop - h, z, len, h, d, metal);
  const nick = { tile: T.white, color: TYPE_METAL.map((c) => c * 0.4) };
  for (const s of [-1, 1]) {
    for (const ny of [0.06, 0.11]) {
      orientedQuad(
        b,
        [x1 + 0.02, yTop - h + ny, z + s * (d * 0.5 + 0.002)],
        [x0 - 0.02, yTop - h + ny, z + s * (d * 0.5 + 0.002)],
        [x0 - 0.02, yTop - h + ny + 0.022, z + s * (d * 0.5 + 0.002)],
        [x1 + 0.02, yTop - h + ny + 0.022, z + s * (d * 0.5 + 0.002)],
        [0, 0, s],
        nick,
      );
    }
  }
  // The face: a shoulder a little inside the body's edge, the letter A standing on it
  b.box(x1 - 0.01, yTop - h + 0.03, z, 0.02, h - 0.06, d - 0.05, metal);
  const face = { tile: T.metal, color: [0.9, 0.88, 0.82] };
  const fx = x1 - 0.04;
  const ah = (h - 0.12) * 0.5;
  const aw = d * 0.34;
  tube(b, fx, yc - ah, z - aw, fx, yc + ah, z, 0.02, 0.02, 4, face);
  tube(b, fx, yc - ah, z + aw, fx, yc + ah, z, 0.02, 0.02, 4, face);
  tube(
    b,
    fx,
    yc - ah * 0.25,
    z - aw * 0.55,
    fx,
    yc - ah * 0.25,
    z + aw * 0.55,
    0.018,
    0.018,
    4,
    face,
  );
}

/**
 * A druggist's sign: a gilt mortar with its pestle leaning out of it, hung on a wrought-iron
 * bracket over the door – the bowl on a foot, its dark inside under the rim, the pestle's club
 * end down in the bowl. `y` is the bracket arm.
 *
 * @param {object} o `{ x: wall face, z, y }`
 */
export function buildMortarSign(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const gilt = { tile: T.metal, color: GILT };
  const tip = x - 1.0;
  const mx = x - 0.62;
  b.box(x - 0.02, y - 0.32, z, 0.04, 0.44, 0.12, iron);
  b.box((x + tip) * 0.5, y, z, x - tip, 0.04, 0.035, iron);
  tube(b, x - 0.02, y - 0.3, z, x - 0.42, y, z, 0.014, 0.014, 4, iron);
  b.box(tip, y - 0.07, z, 0.04, 0.11, 0.035, iron);
  // Two hangers down to the rim
  const rim = y - 0.24;
  for (const dx of [-0.2, 0.2]) b.box(mx + dx, rim, z, 0.02, y - rim, 0.02, iron);
  // Foot, stem, the flaring bowl and its rim, the dark inside
  b.cylinderY(mx, rim - 0.46, z, 0.17, 0.15, 0.06, 12, gilt);
  b.cylinderY(mx, rim - 0.4, z, 0.08, 0.11, 0.09, 10, gilt);
  b.cylinderY(mx, rim - 0.31, z, 0.15, 0.24, 0.27, 12, gilt);
  b.cylinderY(mx, rim - 0.05, z, 0.255, 0.255, 0.05, 12, {
    ...gilt,
    color: GILT.map((c) => c * 0.82),
  });
  b.cylinderY(mx, rim, z, 0.205, 0.205, 0.006, 12, { tile: T.white, color: [0.09, 0.07, 0.05] });
  // The pestle leaning out to one side, its club end down in the bowl
  tube(b, mx + 0.02, rim - 0.1, z - 0.05, mx - 0.03, rim + 0.17, z + 0.27, 0.055, 0.03, 6, gilt);
  b.cylinderY(mx - 0.03, rim + 0.15, z + 0.27, 0.04, 0.03, 0.05, 6, gilt);
}

/**
 * Marquee sign: the fascia sign mounted in a box standing out from the fascia (`y0` its foot,
 * `h` its height), framed by a ring of bulbs that chase round it (shader code 5 + phase: every
 * third bulb lit at a time; the count is a multiple of three so the wave closes on itself).
 */
function buildMarquee(atlas, b, x, cz, y0, h, sign, paint) {
  const T = atlas.tiles;
  const bw = 0.11;
  const sh = h - bw * 2;
  const W = sh * 3 + bw * 2;
  const depth = 0.22;
  // 4 mm inside the band it hangs on at top and bottom (their faces would share the planes)
  b.box(x - depth * 0.5, y0 + 0.004, cz, depth, h - 0.008, W, {
    tile: T.metal,
    color: paint.map((c) => c * 0.8),
    faces: { px: false },
  });
  b.quad([x - depth - 0.004, y0 + bw, cz - sh * 1.5], [0, 0, sh * 3], [0, sh, 0], {
    tile: sign,
    color: WHITE,
    data: [2.5, 0],
  });
  // Bulbs round the border, walked bottom → right → top → left
  const zl = cz - W * 0.5 + bw * 0.5;
  const zr = cz + W * 0.5 - bw * 0.5;
  const yb = y0 + bw * 0.5;
  const yt = y0 + h - bw * 0.5;
  const legs = [
    [zl, yb, zr, yb],
    [zr, yb, zr, yt],
    [zr, yt, zl, yt],
    [zl, yt, zl, yb],
  ];
  const perim = 2 * (zr - zl + yt - yb);
  const n = Math.max(3, Math.round(perim / 0.12 / 3) * 3);
  for (let k = 0; k < n; k++) {
    let s = (perim * k) / n;
    for (const [za, ya, zb, yb2] of legs) {
      const len = Math.abs(zb - za) + Math.abs(yb2 - ya);
      if (s <= len + 1e-6) {
        const t = len > 0 ? s / len : 0;
        const bz = za + (zb - za) * t;
        const by = ya + (yb2 - ya) * t;
        b.box(x - depth - 0.02, by - 0.025, bz, 0.04, 0.05, 0.05, {
          tile: T.bulb,
          color: WHITE,
          data: [5 + (k % 3) / 3, 0],
        });
        break;
      }
      s -= len;
    }
  }
}

/**
 * Romanesque shopfront under one wide round arch (a clockmaker's): rock-faced jambs and deep
 * voussoirs standing out from the wall, so the glass sits well back in the arch; a panelled
 * bulkhead and a plate-glass window either side of the door, a wooden impost across the
 * springing carrying the sign board, and the half-round fanlight above in radiating bars, lit
 * warm at dusk. The door stands deeper still, at the back of a little lobby glazed at its sides
 * (in front of the wall plane, which is the house's solid mass).
 *
 * @param {object} o `{ x, z0, z1: outer edges of the jambs, spring, jamb = 0.32, reveal = 0.5 –
 *   how far the arch stands out, stone: colour, paint, sign, glow: pool colour }`
 * @returns {[number, number]} lot-local Z span of the door (keep clear on the sidewalk)
 */
export function buildArchedShopfront(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1, spring } = o;
  const jamb = o.jamb ?? 0.32;
  const rv = o.reveal ?? 0.5;
  const paint = o.paint ?? [0.22, 0.13, 0.08];
  const frame = { tile: T.wood_paint, color: paint, texScale: 0.6 };
  const rock = { tile: T.stone_rockfaced, color: o.stone ?? STONE_CORNICE, texScale: 0.6 };
  const cz = (z0 + z1) * 0.5;
  const half = (z1 - z0) * 0.5 - jamb;
  // Glass plane a little back inside the reveal, the door at the back of its lobby, in front of
  // the plinth course
  const xg = x - rv + 0.08;
  const xd = x - 0.08;

  // Jambs up to the springing with their impost blocks, the voussoirs round the arch
  for (const s of [-1, 1]) {
    const jz = cz + s * (half + jamb * 0.5);
    b.box(x - rv * 0.5, 0, jz, rv, spring - 0.16, jamb, { ...rock, faces: { ny: false } });
    b.box(x - rv * 0.5 - 0.02, spring - 0.16, jz, rv + 0.04, 0.16, jamb + 0.06, rock);
  }
  archRing(b, x - rv, x + 0.02, cz, spring, half, half + 0.4, 0, Math.PI, 15, rock);

  // Impost across the springing: a wooden beam with the sign board on it
  const beamY = spring - 0.14;
  const beamH = 0.5;
  b.box(xg - 0.05, beamY, cz, 0.1, beamH, half * 2, frame);
  const sign = o.sign && atlas.signs.get(o.sign);
  if (sign) {
    const sh = 0.4;
    b.box(xg - 0.115, beamY + (beamH - sh) * 0.5, cz, 0.03, sh, sh * 3, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: sign, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }

  // Half-round fanlight over the beam: glass (one tile per `half` square, never stretched),
  // radiating bars from a half hub, the moulded frame against the voussoirs
  const rf = half - 0.08;
  const n = 15;
  const arc = arcZY(cz, spring, rf, 0, Math.PI, n);
  const fan = { tile: T.glass_panel, color: WHITE, data: [1.8, 0] };
  const fuv = (z, y) => [(z - (cz - half)) / half, (y - spring) / half];
  for (let i = 0; i < n; i++) {
    orientedTri(
      b,
      [xg - 0.03, spring, cz],
      [xg - 0.03, arc[i][1], arc[i][0]],
      [xg - 0.03, arc[i + 1][1], arc[i + 1][0]],
      fuv(cz, spring),
      fuv(...arc[i]),
      fuv(...arc[i + 1]),
      [-1, 0, 0],
      fan,
    );
  }
  archRing(b, xg - 0.07, xg + 0.02, cz, spring, rf, half - 0.005, 0, Math.PI, n, frame);
  archRing(b, xg - 0.07, xg - 0.01, cz, spring, 0.42, 0.54, 0, Math.PI, 7, frame);
  for (let i = 1; i < 6; i++) {
    const a = (Math.PI * i) / 6;
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    tube(
      b,
      xg - 0.05,
      spring + sa * 0.54,
      cz + ca * 0.54,
      xg - 0.05,
      spring + sa * rf,
      cz + ca * rf,
      0.016,
      0.016,
      4,
      frame,
    );
  }

  // Door in the middle at the back of its lobby: floor, soffit, glazed returns, dark reveal
  const dw = 1.0;
  const dz = cz;
  const lobbyW = dw + 0.12;
  const ceil = beamY - 0.06;
  b.box((xg + xd) * 0.5, 0, dz, xd - xg, 0.04, lobbyW, {
    tile: T.wall_stone,
    color: STONE_STEP,
    texScale: 0.6,
  });
  b.box((xg + xd) * 0.5, ceil, dz, xd - xg, 0.06, lobbyW, frame);
  b.quad([xd - 0.012, 0, dz - lobbyW * 0.5], [0, 0, lobbyW], [0, ceil, 0], {
    tile: T.white,
    color: [0.08, 0.075, 0.07],
  });
  for (const s of [-1, 1]) {
    const wz = dz + s * lobbyW * 0.5;
    b.box((xg + xd) * 0.5, 0, wz, xd - xg, 0.4, 0.04, frame);
    orientedQuad(b, [xg, 0.4, wz], [xd, 0.4, wz], [xd, ceil, wz], [xg, ceil, wz], [0, 0, -s], {
      tile: T.glass_panel,
      color: WHITE,
      data: [1.6, 0],
    });
  }
  const dh = Math.min(2.2, ceil - 0.08);
  buildPanelledDoor(atlas, b, xd, 0.04, dz, dw, dh, paint, {
    glazed: true,
    glow: 1.8,
    paint: true,
  });
  b.box(xd - 0.03, 0.04 + dh, dz, 0.06, ceil - dh - 0.04, dw + 0.04, frame);

  // Display windows either side of the lobby: bulkhead, plate glass in slim frames
  const bulk = 0.5;
  const glassH = beamY - bulk - 0.08;
  for (const [g0, g1] of [
    [cz - half, dz - lobbyW * 0.5],
    [dz + lobbyW * 0.5, cz + half],
  ]) {
    const panes = Math.max(1, Math.round((g1 - g0) / (glassH * 0.85)));
    const pw = (g1 - g0) / panes;
    b.box(xg - 0.05, 0, (g0 + g1) * 0.5, 0.1, bulk, g1 - g0, frame);
    b.box(xg - 0.09, bulk, (g0 + g1) * 0.5, 0.16, 0.04, g1 - g0 + 0.02, frame);
    for (let i = 0; i < panes; i++) {
      const pz0 = g0 + i * pw;
      b.quad([xg - 0.03, bulk + 0.04, pz0 + 0.03], [0, 0, pw - 0.06], [0, glassH, 0], {
        tile: T.shop_glass,
        color: WHITE,
        rep: [1, 1],
        data: [windowSeed(rng, true), 0],
      });
      if (i > 0) b.box(xg - 0.06, bulk, pz0, 0.1, glassH + 0.08, 0.06, frame);
    }
  }

  return [dz - dw * 0.5 - 0.4, dz + dw * 0.5 + 0.4];
}

/** Cream porcelain enamel and its red band (1950s fronts). */
const ENAMEL_CREAM = Object.freeze([0.95, 0.9, 0.76]);
const ENAMEL_RED = Object.freeze([0.78, 0.12, 0.1]);
/** Bright aluminium of door frames and the backs of chrome strips. */
const ALUMINIUM = Object.freeze([0.78, 0.81, 0.84]);

/**
 * A 1950s remodelled shopfront (a burger bar; NPS Brief 11: later fronts are part of a building's
 * history too): cream porcelain-enamel panels from the sidewalk to the belt course, red enamel
 * bands along the bulkhead and the top, polished chrome edging, one long display window lit
 * from inside, its glass turning a rounded corner into the recessed entrance lobby, an
 * aluminium-framed glass door at the back of the lobby (checkered floor, enamel soffit with a
 * light), the script neon on a chrome-framed enamel panel over the window and a round blade sign
 * hung out above the door.
 *
 * The lobby is cut into the ground storey (`recess`, from `SpecPlanner`): the door stands on
 * its back wall, the rounded glass on its right, the enamel pier on its left.
 *
 * @param {object} o `{ x, z0, z1, top, recess: { z0, z1, h, depth }, curve: radius of the rounded
 *   glass, script: tile, blade: { tile, r }, light: colour of the lit glass, glow: pool colour }`
 * @returns {[number, number]} lot-local Z span of the door (keep clear on the sidewalk)
 */
export function buildDinerFront(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1, top, recess } = o;
  const R = o.curve ?? 0.5;
  const D = recess.depth;
  const H = recess.h;
  const rz0 = recess.z0;
  const rz1 = recess.z1;
  const cream = { tile: T.enamel_panel, color: o.enamel ?? ENAMEL_CREAM, texScale: 1.2 };
  const red = { tile: T.enamel_panel, color: o.band ?? ENAMEL_RED, texScale: 1.2 };
  const alu = { tile: T.metal, color: ALUMINIUM };
  const lit = o.light ?? [1.0, 0.86, 0.66];
  const chromeH = (cx, y, cz, sy, sz, sx = 0.035) =>
    b.box(cx, y, cz, sx, sy, sz, {
      ...alu,
      faces: { nx: { tile: T.chrome, color: WHITE, rep: [Math.max(1, Math.round(sz / 0.6)), 1] } },
    });
  const chromeV = (xf, y0, y1, zc, w) => {
    // A hair wider than the enamel it edges: the end faces would share their planes
    b.box(xf + 0.02, y0, zc, 0.04, y1 - y0, w + 0.004, alu);
    b.quad([xf - 0.001, y0, zc + w * 0.5], [0, y1 - y0, 0], [0, 0, -w], {
      tile: T.chrome,
      color: WHITE,
      rep: [Math.max(1, Math.round((y1 - y0) / 0.6)), 1],
    });
  };

  // Enamel facing: the pier left of the lobby, the narrow pier at the right end, the fascia
  // across the whole front over the window head (its soffit closes the lobby's opening)
  const endPier = 0.16;
  b.box(x - 0.03, 0, (z0 + rz0) * 0.5, 0.06, H, rz0 - z0, cream);
  b.box(x - 0.03, 0, z1 - endPier * 0.5, 0.06, H, endPier, cream);
  b.box(x - 0.03, H, (z0 + z1) * 0.5, 0.06, top - H - 0.004, z1 - z0, cream);
  // Red bands: along the top of the front and round the foot of the piers, chrome-edged
  b.box(x - 0.07, top - 0.24, (z0 + z1) * 0.5, 0.025, 0.2, z1 - z0, red);
  chromeH(x - 0.075, top - 0.28, (z0 + z1) * 0.5, 0.04, z1 - z0 + 0.02);
  chromeH(x - 0.075, top - 0.04, (z0 + z1) * 0.5, 0.04, z1 - z0 + 0.02);
  for (const [a, c] of [
    [z0, rz0],
    [z1 - endPier, z1],
  ]) {
    b.box(x - 0.07, 0.22, (a + c) * 0.5, 0.025, 0.18, c - a, red);
  }
  // Chrome edging down the outer corners and along the window head
  chromeV(x - 0.07, 0, top, z0 + 0.025, 0.05);
  chromeV(x - 0.07, 0, H, z1 - 0.025, 0.05);
  chromeH(x - 0.075, H - 0.02, (z0 + z1) * 0.5, 0.05, z1 - z0);

  // The glazing path from the door's wall round the rounded corner to the right end: the glass
  // return along the lobby, the quarter circle, the long front run (all facing out)
  const xf = x - 0.03;
  const zr = rz1 - R;
  const path = [[x + D - 0.02, zr]];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 0.5 * i) / n;
    path.push([xf + R - Math.sin(a) * R, rz1 - Math.cos(a) * R]);
  }
  path.push([xf, z1 - endPier]);
  const bulk = 0.55;
  const glassH = H - 0.06 - bulk;
  const paneW = glassH * (128 / 150);
  let u = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i];
    const [cx, cz] = path[i + 1];
    const len = Math.hypot(cx - ax, cz - az);
    // Outward normal of the segment (u × up), to stand the bands a hair proud of the bulkhead
    const nx = -(cz - az) / len;
    const nz = (cx - ax) / len;
    const along = [cx - ax, 0, cz - az];
    b.quad([ax, 0, az], along, [0, bulk, 0], { ...cream, rep: [len / 1.2, bulk / 1.2] });
    b.quad([ax + nx * 0.004, 0.22, az + nz * 0.004], along, [0, 0.18, 0], {
      ...red,
      rep: [len / 1.2, 0.15],
    });
    b.quad([ax, bulk, az], along, [0, glassH, 0], {
      tile: T.shop_glass,
      color: lit,
      rep: [len / paneW, 1],
      uvOffset: [u, 0],
      data: [6.0, 0],
    });
    u += len / paneW;
    // Chrome sill rail and head rail along the glass
    tube(b, ax, bulk, az, cx, bulk, cz, 0.03, 0.03, 4, alu);
    tube(b, ax, H - 0.05, az, cx, H - 0.05, cz, 0.025, 0.025, 4, alu);
  }
  // Mullions at the ends of the curve and every pane width along the front run
  const run0 = rz1;
  const run1 = z1 - endPier;
  const panes = Math.max(1, Math.round((run1 - run0) / 1.6));
  for (let i = 1; i < panes; i++)
    chromeV(xf - 0.01, bulk, H - 0.05, run0 + ((run1 - run0) * i) / panes, 0.05);

  // The lobby: checkered floor, enamel soffit with a light, enamel on its left wall and round
  // the door on the back wall
  const lobbyW = zr - rz0;
  b.box(x + D * 0.5, 0, (rz0 + rz1) * 0.5, D, 0.035, rz1 - rz0, {
    tile: T.checker,
    color: WHITE,
    texScale: 0.5,
  });
  b.quad([x, H - 0.004, rz0], [D, 0, 0], [0, 0, rz1 - rz0], {
    ...cream,
    rep: [D / 1.2, (rz1 - rz0) / 1.2],
  });
  b.cylinderY(x + D * 0.5, H - 0.08, (rz0 + zr) * 0.5, 0.12, 0.12, 0.076, 8, {
    tile: T.bulb,
    color: WHITE,
    data: [2.5, 0],
  });
  orientedQuad(
    b,
    [x, 0, rz0 + 0.003],
    [x + D, 0, rz0 + 0.003],
    [x + D, H, rz0 + 0.003],
    [x, H, rz0 + 0.003],
    [0, 0, 1],
    {
      ...cream,
      rep: [D / 1.2, H / 1.2],
    },
  );
  const dw = 0.95;
  const dh = 2.2;
  const dz = rz0 + lobbyW * 0.5;
  const xd = x + D;
  for (const [a, c] of [
    [rz0, dz - dw * 0.5 - 0.04],
    [dz + dw * 0.5 + 0.04, zr],
  ]) {
    if (c - a > 0.01) {
      b.quad([xd - 0.004, 0, a], [0, 0, c - a], [0, H, 0], {
        ...cream,
        rep: [(c - a) / 1.2, H / 1.2],
      });
    }
  }
  // The door: dark opening, aluminium frame, full glass, a chrome push bar; a glass transom
  b.quad([xd - 0.006, 0, dz - dw * 0.5 - 0.04], [0, 0, dw + 0.08], [0, H, 0], {
    tile: T.white,
    color: [0.08, 0.075, 0.07],
  });
  for (const s of [-1, 1]) b.box(xd - 0.03, 0.035, dz + s * (dw * 0.5 - 0.03), 0.05, dh, 0.06, alu);
  b.box(xd - 0.031, 0.035, dz, 0.056, 0.14, dw, alu);
  b.box(xd - 0.03, dh - 0.03, dz, 0.05, 0.07, dw + 0.08, alu);
  b.quad([xd - 0.032, 0.175, dz - dw * 0.5 + 0.06], [0, 0, dw - 0.12], [0, dh - 0.21, 0], {
    tile: T.glass_panel,
    color: lit,
    data: [6.0, 0],
  });
  b.box(xd - 0.09, 1.0, dz, 0.03, 0.045, dw - 0.24, { tile: T.metal, color: [0.9, 0.92, 0.94] });
  for (const s of [-1, 1])
    b.box(xd - 0.07, 0.99, dz + s * (dw * 0.5 - 0.15), 0.05, 0.06, 0.03, alu);
  b.quad([xd - 0.032, dh + 0.06, dz - dw * 0.5 + 0.03], [0, 0, dw - 0.06], [0, H - dh - 0.1, 0], {
    tile: T.glass_panel,
    color: lit,
    data: [6.0, 0],
  });

  // Script neon on an enamel panel in a chrome frame, centred over the display window
  const script = o.script && T[o.script];
  if (script) {
    const room = top - 0.32 - (H + 0.08);
    const sh = Math.min(room, (run1 - run0 - 0.3) * 0.5);
    const sw = sh * 2;
    const sz = (run0 + run1) * 0.5;
    const sy = H + 0.04 + (room - sh) * 0.5;
    b.box(x - 0.1, sy - 0.04, sz, 0.06, sh + 0.08, sw + 0.08, alu);
    b.quad([x - 0.132, sy, sz - sw * 0.5], [0, 0, sw], [0, sh, 0], {
      tile: script,
      color: WHITE,
      data: [1.8, 0],
    });
  }
  if (o.blade) {
    // Over the enamel pier beside the lobby, clear of the windows upstairs
    const r = o.blade.r ?? 0.42;
    buildBladeSign(atlas, b, { x, z: (z0 + rz0) * 0.5, y: top + 0.3 + r, r, tile: o.blade.tile });
  }

  // The lobby lamp lights its own chequered floor
  pools.quad([x + 0.05, 0.04, rz0 + 0.05], [D - 0.1, 0, 0], [0, 0, lobbyW - 0.1], {
    color: [0.7, 0.56, 0.36],
    data: [-1.0, 0],
  });
  return [dz - dw * 0.5 - 0.4, dz + dw * 0.5 + 0.4];
}

/**
 * Barber's pole on a wall bracket: chrome base cup and domed top with a ball finial, and the
 * glass tube between them with the red, white and blue spiral running round it once – the
 * shader scrolls the stripes up the tube (code 4). `x` is the face it is mounted on, `y` the
 * foot of the tube.
 *
 * @param {object} o `{ x, z, y, h = 0.62, r = 0.075 }`
 */
export function buildBarberPole(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const h = o.h ?? 0.62;
  const r = o.r ?? 0.075;
  const cx = x - 0.2;
  const chrome = { tile: T.metal, color: [0.78, 0.8, 0.82] };
  b.box(x - 0.015, y - 0.14, z, 0.03, h + 0.36, 0.1, chrome);
  for (const ay of [y - 0.07, y + h + 0.04]) {
    b.box((x + cx) * 0.5, ay, z, x - cx, 0.03, 0.03, chrome);
  }
  b.cylinderY(cx, y - 0.1, z, r + 0.012, r + 0.026, 0.1, 10, chrome);
  b.cylinderY(cx, y + h, z, r + 0.026, r + 0.008, 0.08, 10, chrome);
  b.cylinderY(cx, y + h + 0.08, z, 0.04, 0.018, 0.06, 8, chrome);
  // The tube: U runs once round it (decreasing with the angle so the faces point outward),
  // V up it at the same scale, so the 45° stripes stay square
  const segs = 12;
  const rv = h / (2 * Math.PI * r);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    b.quad(
      p0,
      [(Math.cos(a0) - Math.cos(a1)) * r, 0, (Math.sin(a0) - Math.sin(a1)) * r],
      [0, h, 0],
      {
        tile: T.barber_pole,
        color: WHITE,
        rep: [1 / segs, rv],
        uvOffset: [1 - (i + 1) / segs, 0],
        data: [4.0, 0],
      },
    );
  }
}

/**
 * Exhibition banner hung out from the facade on an iron arm: a wall plate, the arm with a
 * stay, a batten, and the printed cloth (`tile`, 1:2) facing up and down the street on both
 * sides. The cloth sways in the wind (vertex sway weight).
 *
 * @param {object} o `{ x: wall face, z, y: top of the cloth, w = 0.8, h = 1.6, tile }`
 */
export function buildBanner(atlas, b, o) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const { x, z, y } = o;
  const w = o.w ?? 0.8;
  const h = o.h ?? 1.6;
  const reach = w + 0.25;
  b.box(x - 0.02, y - 0.25, z, 0.04, 0.4, 0.1, iron);
  b.box(x - reach * 0.5, y + 0.05, z, reach, 0.04, 0.04, iron);
  tube(b, x - 0.02, y - 0.22, z, x - reach * 0.6, y + 0.05, z, 0.012, 0.012, 4, iron);
  b.box(x - 0.2 - w * 0.5, y - 0.04, z, w + 0.04, 0.05, 0.03, iron);
  for (const s of [-1, 1]) {
    const zf = z + s * 0.012;
    orientedQuad(
      b,
      [x - 0.2 - w, y - 0.04 - h, zf],
      [x - 0.2, y - 0.04 - h, zf],
      [x - 0.2, y - 0.04, zf],
      [x - 0.2 - w, y - 0.04, zf],
      [0, 0, s],
      { tile: o.tile, color: WHITE, rep: [1, 1], data: [0, 0.3] },
    );
  }
}

/**
 * Vertical sign standing out from the facade over several storeys (a hotel's neon): a board
 * `w` wide and `h` tall held `gap` off the wall on iron arms, its tile on both faces so it reads
 * up and down the street, the edges and ends in dark iron.
 *
 * `dusk`: the neon is dim by day and lights up with the street lamps (a bar's), else it glows
 * day and night (a hotel's).
 *
 * @param {object} o `{ x: wall face, z, y0, h, w = 0.9, gap = 0.22, tile, dusk }`
 */
export function buildVerticalSign(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y0, h } = o;
  const w = o.w ?? 0.9;
  const gap = o.gap ?? 0.22;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const face = { tile: o.tile, color: WHITE, rep: [1, 1], data: [o.dusk ? 0 : 2.5, 0] };
  b.box(x - gap - w * 0.5, y0, z, w, h, 0.12, { ...iron, faces: { pz: face, nz: face } });
  // Cap and foot of the board, the arms back to the wall with their wall plates
  b.box(x - gap - w * 0.5, y0 + h, z, w + 0.06, 0.06, 0.16, iron);
  b.box(x - gap - w * 0.5, y0 - 0.06, z, w + 0.06, 0.06, 0.16, iron);
  for (const t of [0.08, 0.5, 0.92]) {
    const ay = y0 + h * t;
    b.box(x - gap * 0.5, ay, z, gap + 0.02, 0.05, 0.05, iron);
    b.box(x - 0.015, ay - 0.1, z, 0.03, 0.25, 0.14, iron);
  }
}

/**
 * Round blade sign hung out over the sidewalk on a wrought-iron bracket: a wall plate, the
 * arm with a diagonal stay and a scroll at its tip, two hangers and the disc itself, painted
 * on both faces (`tile` is round in its square, the geometry is a 16-sided disc). The disc
 * faces up and down the street, so drivers read it from far off.
 *
 * @param {object} o `{ x: wall face, z, y: disc centre, r = 0.42, tile }`
 */
export function buildBladeSign(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const r = o.r ?? 0.42;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const cx = x - 0.24 - r;
  const armY = y + r + 0.12;
  const tip = cx - r - 0.1;
  b.box(x - 0.02, armY - 0.3, z, 0.04, 0.4, 0.12, iron);
  b.box((x + tip) * 0.5, armY, z, x - tip, 0.04, 0.035, iron);
  tube(b, x - 0.02, armY - 0.28, z, cx + r * 0.3, armY, z, 0.014, 0.014, 4, iron);
  b.box(tip - 0.02, armY - 0.06, z, 0.04, 0.12, 0.035, iron);
  for (const dx of [-0.55, 0.55]) {
    const hy = y + r * 0.8;
    b.box(cx + dx * r, hy, z, 0.02, armY - hy, 0.02, iron);
  }
  const n = 16;
  const ring = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n;
    ring.push([Math.cos(a), Math.sin(a)]);
  }
  for (const s of [-1, 1]) {
    const zf = z + s * 0.016;
    // Looking at either face the picture reads the same way round
    const uv = ([c, sn]) => [0.5 + s * c * 0.5, 0.5 + sn * 0.5];
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const c = ring[i + 1];
      orientedTri(
        b,
        [cx, y, zf],
        [cx + a[0] * r, y + a[1] * r, zf],
        [cx + c[0] * r, y + c[1] * r, zf],
        [0.5, 0.5],
        uv(a),
        uv(c),
        [0, 0, s],
        { tile: o.tile, color: WHITE, data: [2.5, 0] },
      );
    }
  }
}

/**
 * Workshop front of a one-storey taxpayer, filling `z0..z1` between the brick end piers: a wide
 * steel roll-down shutter left part-way open over the warmly lit workshop (no interior, just
 * its light), a brick pier, a narrow display window and a glazed door with a transom light,
 * a steel fascia across the whole front with the sign over the shutter, a blade sign over the
 * door and a floor pump by the step.
 *
 * @param {object} o `{ x, z0, z1, top, paint, sign, roller: width (m), open = 0.45 – share of the
 *   shutter opening left open, blade: { tile, r }, pump }`
 * @returns {[number, number]} lot-local Z span of the door (keep clear on the sidewalk)
 */
export function buildWorkshopFront(atlas, b, pools, rng, o) {
  const T = atlas.tiles;
  const { x, z0, z1, top } = o;
  const paint = o.paint ?? [0.22, 0.27, 0.24];
  const frame = { tile: T.wood_paint, color: paint, texScale: 0.6 };
  const steel = { tile: T.metal, color: paint.map((c) => c * 0.8) };
  const dark = { tile: T.white, color: [0.07, 0.065, 0.06] };
  const fasciaY0 = top - 0.85;
  const oh = fasciaY0 - 0.06; // head of the openings

  // Steel fascia over the whole front, a capping strip on top, the sign over the shutter
  const rz0 = z0;
  const rz1 = z0 + o.roller;
  b.box(x - 0.06, fasciaY0, (z0 + z1) * 0.5, 0.12, top - fasciaY0 - 0.06, z1 - z0, steel);
  b.box(x - 0.1, top - 0.08, (z0 + z1) * 0.5, 0.18, 0.08, z1 - z0 + 0.06, steel);
  const sign = o.sign && atlas.signs.get(o.sign);
  if (sign) {
    const sh = Math.min(0.6, top - fasciaY0 - 0.2);
    b.box(x - 0.135, fasciaY0 + 0.08, (rz0 + rz1) * 0.5, 0.03, sh, sh * 3, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: sign, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }

  // Roll-down shutter: guide channels, the drum housing, the curtain stopped part-way and the
  // lit workshop showing underneath
  const rw = rz1 - rz0;
  const yOpen = Math.max(0.6, oh * (o.open ?? 0.45));
  b.quad([x - 0.012, 0, rz0], [0, 0, rw], [0, oh, 0], dark);
  // The workshop's light: brightest on the floor, fading up into the curtain's shadow
  const bands = [
    [0, 0.22, [0.5, 0.33, 0.17], 2.6],
    [0.22, yOpen - 0.26, [0.3, 0.19, 0.1], 2.6],
    [yOpen - 0.26, yOpen, [0.1, 0.07, 0.05], 0],
  ];
  for (const [y0, y1, color, glow] of bands) {
    b.quad([x - 0.016, y0, rz0 + 0.06], [0, 0, rw - 0.12], [0, y1 - y0, 0], {
      tile: T.white,
      color,
      data: [glow, 0],
    });
  }
  b.quad([x - 0.03, yOpen, rz0 + 0.06], [0, 0, rw - 0.12], [0, oh - yOpen, 0], {
    tile: T.shutter,
    color: [0.62, 0.66, 0.64],
    rep: [1, 1],
  });
  b.box(x - 0.05, yOpen - 0.05, (rz0 + rz1) * 0.5, 0.06, 0.06, rw - 0.12, {
    tile: T.metal,
    color: [0.5, 0.52, 0.54],
  });
  for (const gz of [rz0 + 0.04, rz1 - 0.04]) {
    b.box(x - 0.05, 0, gz, 0.1, oh, 0.084, { tile: T.metal, color: [0.36, 0.38, 0.4] });
  }
  b.box(x - 0.14, oh - 0.3, (rz0 + rz1) * 0.5, 0.28, 0.32, rw + 0.04, steel);
  b.box(x - 0.2, 0, (rz0 + rz1) * 0.5, 0.4, 0.03, rw, { tile: T.metal, color: [0.32, 0.33, 0.35] });

  // Door at the right end, the display window between it and the brick pier
  const dw = 0.92;
  const dz = z1 - 0.12 - dw * 0.5;
  const w0 = rz1 + 0.4;
  const w1 = dz - dw * 0.5 - 0.14;
  b.box(x - 0.2, 0, dz, 0.4, 0.12, dw + 0.236, { tile: T.wall_stone, color: STONE_STEP });
  buildPanelledDoor(atlas, b, x, 0.12, dz, dw, 2.2, paint, {
    glazed: true,
    glow: 1.8,
    paint: true,
  });
  b.quad([x - 0.012, 2.32, dz - dw * 0.5], [0, 0, dw], [0, oh - 2.32, 0], dark);
  b.quad([x - 0.03, 2.38, dz - dw * 0.5 + 0.04], [0, 0, dw - 0.08], [0, oh - 2.44, 0], {
    tile: T.glass_panel,
    color: WHITE,
    data: [1.8, 0],
  });
  b.box(x - 0.05, 2.3, dz, 0.1, 0.08, dw + 0.08, frame);
  for (const jz of [dz - dw * 0.5 - 0.07, dz + dw * 0.5 + 0.07, w0 + 0.05]) {
    b.box(x - 0.06, 0, jz, 0.12, oh, 0.1, frame);
  }
  const bulk = 0.55;
  b.box(x - 0.05, 0, (w0 + w1) * 0.5, 0.1, bulk, w1 - w0, frame);
  b.box(x - 0.09, bulk, (w0 + w1) * 0.5, 0.16, 0.04, w1 - w0 + 0.04, frame);
  b.quad([x - 0.03, bulk + 0.04, w0 + 0.1], [0, 0, w1 - w0 - 0.1], [0, oh - bulk - 0.1, 0], {
    tile: T.shop_glass,
    color: WHITE,
    rep: [1, 1],
    data: [windowSeed(rng, true), 0],
  });
  b.box(
    x - 0.062,
    oh - 0.06,
    (w0 + dz + dw * 0.5) * 0.5,
    0.124,
    0.063,
    dz + dw * 0.5 - w0 + 0.1,
    frame,
  );

  if (o.blade) {
    const r = o.blade.r ?? 0.36;
    buildBladeSign(atlas, b, { x: x - 0.12, z: dz, y: fasciaY0 + 0.38, r, tile: o.blade.tile });
  }

  if (o.pump) {
    // Floor pump standing by the step: foot plate, barrel, T-handle, a hose loop
    const px = x - 0.32;
    const pz = dz - dw * 0.5 - 0.42;
    const red = { tile: T.metal, color: [0.7, 0.16, 0.12] };
    b.box(px, 0, pz, 0.22, 0.03, 0.12, { tile: T.metal, color: CHARCOAL_IRON });
    b.cylinderY(px, 0.03, pz, 0.035, 0.035, 0.56, 8, red);
    b.box(px, 0.59, pz, 0.04, 0.12, 0.03, { tile: T.metal, color: [0.7, 0.72, 0.74] });
    b.box(px, 0.71, pz, 0.04, 0.03, 0.26, { tile: T.metal, color: CHARCOAL_IRON });
    tube(b, px, 0.1, pz + 0.03, px - 0.08, 0.3, pz + 0.1, 0.008, 0.008, 4, dark);
    tube(b, px - 0.08, 0.3, pz + 0.1, px, 0.5, pz + 0.05, 0.008, 0.008, 4, dark);
  }

  return [dz - dw * 0.5 - 0.4, dz + dw * 0.5 + 0.4];
}
