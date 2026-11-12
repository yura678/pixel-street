/**
 * Building services on the facade: split-AC condensers, window AC units, cast-iron
 * downpipes, a laundromat's dryer duct, trash cans, a street mailbox, rooftop ventilation units,
 * on flank walls a meter cabinet, a dish lamp and a bracket lantern – and the street's clocks:
 * the hands every clock takes (`buildClockHands`) and a clockmaker's bracket clock.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { BRASS_TRIM, WHITE, CHARCOAL_IRON } from './palette.js';
import { orientedQuad, orientedTri, tube } from './primitives.js';

/** The time every clock on the street shows (they stand still): ten past ten. */
export const STREET_TIME = Object.freeze({ h: 10, m: 10 });

/**
 * Angles of the hands at `time`, clockwise from twelve (radians).
 * @param {{ h: number, m: number }} [time]
 */
export function clockHandAngles(time = STREET_TIME) {
  return {
    hour: (((time.h % 12) + time.m / 60) / 12) * Math.PI * 2,
    minute: (time.m / 60) * Math.PI * 2,
  };
}

/**
 * Hands of a clock dial of radius `r` centred at `x, y, z`, its face looking along `n` (−X on a
 * facade, ±Z up and down the street): the short hour hand and the long minute hand, flat
 * tapering blades of dark iron standing a hair off the dial. Every clock of the street takes
 * its hands from here, so they all show the same time (`STREET_TIME`).
 *
 * @param {object} o `{ x, y, z, r, n = [-1, 0, 0] }`
 */
export function buildClockHands(atlas, b, o) {
  const { x, y, z, r } = o;
  const n = o.n ?? [-1, 0, 0];
  const iron = { tile: atlas.tiles.metal, color: CHARCOAL_IRON };
  // Right of a viewer facing the dial: (−n) × up
  const R = [n[2], 0, -n[0]];
  const { hour, minute } = clockHandAngles();
  const hand = (a, len, tail, wid, off) => {
    const [sa, ca] = [Math.sin(a), Math.cos(a)];
    const d = [R[0] * sa, ca, R[2] * sa];
    const s = [R[0] * ca, -sa, R[2] * ca];
    const P = (along, across) => [
      x + n[0] * off + d[0] * along + s[0] * across,
      y + d[1] * along + s[1] * across,
      z + n[2] * off + d[2] * along + s[2] * across,
    ];
    orientedQuad(
      b,
      P(-tail, -wid * 0.5),
      P(-tail, wid * 0.5),
      P(len, wid * 0.16),
      P(len, -wid * 0.16),
      n,
      iron,
    );
  };
  hand(hour, r * 0.55, r * 0.12, r * 0.14, 0.012);
  hand(minute, r * 0.84, r * 0.15, r * 0.09, 0.02);
}

/**
 * The clockmaker's sign: a double-sided clock hung out over the sidewalk on a wrought-iron
 * bracket – a wall plate, the arm with a stay, the hanger, a brass drum with a lit dial and the
 * street's hands on both faces (up and down the street), a ball finial on top. `x` is the wall
 * face, `y` the height of the dials' centre.
 *
 * @param {object} o `{ x, z, y, r = 0.3, reach = 0.95 – wall to the drum's axis }`
 */
export function buildBracketClock(atlas, b, o) {
  const T = atlas.tiles;
  const { x, z, y } = o;
  const r = o.r ?? 0.3;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const brass = { tile: T.metal, color: BRASS_TRIM };
  const cx = x - (o.reach ?? 0.95);
  const armY = y + r + 0.2;
  const tip = cx - 0.12;
  // Wall plate, the arm out past the drum with a scroll at its tip, the stay from below
  b.box(x - 0.02, armY - 0.45, z, 0.04, 0.6, 0.14, iron);
  b.box((x + tip) * 0.5, armY, z, x - tip, 0.045, 0.04, iron);
  b.box(tip - 0.02, armY - 0.07, z, 0.04, 0.14, 0.04, iron);
  tube(b, x - 0.02, armY - 0.42, z, cx + 0.32, armY, z, 0.016, 0.016, 4, iron);
  // Hanger with a ball finial on the drum
  b.box(cx, y + r + 0.06, z, 0.03, armY - y - r - 0.06, 0.03, iron);
  b.cylinderY(cx, y + r - 0.02, z, 0.06, 0.03, 0.09, 6, brass);

  // The drum: a short brass cylinder across the street's axis
  const t = 0.16;
  const segs = 16;
  const ring = [];
  for (let i = 0; i <= segs; i++) {
    const a = (Math.PI * 2 * i) / segs;
    ring.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < segs; i++) {
    const [c0, s0] = ring[i];
    const [c1, s1] = ring[i + 1];
    orientedQuad(
      b,
      [cx + c0 * r, y + s0 * r, z - t * 0.5],
      [cx + c1 * r, y + s1 * r, z - t * 0.5],
      [cx + c1 * r, y + s1 * r, z + t * 0.5],
      [cx + c0 * r, y + s0 * r, z + t * 0.5],
      [(c0 + c1) * 0.5, (s0 + s1) * 0.5, 0],
      brass,
    );
  }
  // Both faces: the lit dial in a raised bezel, the hands and a brass hub
  for (const s of [-1, 1]) {
    const zf = z + s * (t * 0.5 + 0.004);
    const rd = r - 0.035;
    // Looking at either face the dial reads the right way round
    const uv = ([c, sn]) => [0.5 + s * c * 0.5, 0.5 + sn * 0.5];
    for (let i = 0; i < segs; i++) {
      const a = ring[i];
      const c = ring[i + 1];
      orientedTri(
        b,
        [cx, y, zf],
        [cx + a[0] * rd, y + a[1] * rd, zf],
        [cx + c[0] * rd, y + c[1] * rd, zf],
        [0.5, 0.5],
        uv(a),
        uv(c),
        [0, 0, s],
        { tile: T.clock_dial, color: WHITE, data: [0, 0] },
      );
      orientedQuad(
        b,
        [cx + a[0] * rd, y + a[1] * rd, zf + s * 0.012],
        [cx + c[0] * rd, y + c[1] * rd, zf + s * 0.012],
        [cx + c[0] * (r + 0.01), y + c[1] * (r + 0.01), zf + s * 0.012],
        [cx + a[0] * (r + 0.01), y + a[1] * (r + 0.01), zf + s * 0.012],
        [0, 0, s],
        brass,
      );
    }
    buildClockHands(atlas, b, { x: cx, y, z: zf, r: rd, n: [0, 0, s] });
    b.box(cx, y - 0.018, zf + s * 0.026, 0.036, 0.036, 0.016, brass);
  }
}

/** Split-system AC condenser on wall brackets (single or twin), with a round fan grille. */
export function buildWallAcCondenser(atlas, b, xFace, y, cz, double = false) {
  const T = atlas.tiles;
  const units = double ? [-0.4, 0.4] : [0];
  for (const dz of units) {
    const z = cz + dz;
    b.box(xFace - 0.17, y, z, 0.3, 0.457, 0.74, {
      tile: T.white,
      color: [0.8, 0.81, 0.8],
      faces: { nx: { tile: T.vent, color: [0.86, 0.87, 0.86], rep: [1, 1] } },
    });
    b.cylinderX(xFace - 0.325, y + 0.23, z - 0.08, 0.16, 0.012, 12, {
      tile: T.white,
      color: [0.2, 0.21, 0.22],
    });
    b.cylinderX(xFace - 0.33, y + 0.23, z - 0.08, 0.05, 0.012, 8, {
      tile: T.white,
      color: [0.62, 0.63, 0.62],
    });
    for (const bz of [-0.26, 0.26]) {
      b.box(xFace - 0.19, y - 0.06, z + bz, 0.36, 0.05, 0.04, {
        tile: T.metal,
        color: CHARCOAL_IRON,
      });
    }
  }
  // Refrigerant line running down to the window below
  b.box(xFace - 0.03, y - 0.5, cz + (double ? 0.85 : 0.45), 0.04, 0.95, 0.04, {
    tile: T.white,
    color: [0.78, 0.78, 0.76],
  });
}

/** Cast-iron rainwater downpipe with a hopper head and wall clips. */
export function buildDownpipe(atlas, b, xFace, z, topY) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: [0.2, 0.21, 0.23] };
  b.box(xFace - 0.06, 0.62, z, 0.09, topY - 0.62, 0.09, iron);
  b.box(xFace - 0.082, topY - 0.05, z, 0.164, 0.26, 0.2, iron);
  b.box(xFace - 0.04, 0.3, z, 0.12, 0.34, 0.09, iron);
  for (let y = 1.4; y < topY - 0.4; y += 1.3) {
    b.box(xFace - 0.05, y, z, 0.12, 0.05, 0.13, iron);
  }
}

/**
 * Enamel dish lamp over a back door: a wall plate, a gooseneck arm curving out and down, the
 * shallow green enamel shade and the bulb under it, which lights a pool on the ground at night.
 * `y` is the height of the shade's rim.
 */
export function buildDishLamp(atlas, b, pools, x, z, y) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  const enamel = { tile: T.metal, color: [0.18, 0.34, 0.24] };
  b.box(x - 0.015, y + 0.3, z, 0.03, 0.2, 0.12, iron);
  // Gooseneck: out from the wall, then curving down over the shade
  const pts = [
    [x - 0.03, y + 0.4],
    [x - 0.22, y + 0.44],
    [x - 0.36, y + 0.38],
    [x - 0.42, y + 0.24],
    [x - 0.42, y + 0.12],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [xa, ya] = pts[i];
    const [xb, yb] = pts[i + 1];
    tube(b, xa, ya, z, xb, yb, z, 0.016, 0.016, 4, iron);
  }
  b.cylinderY(x - 0.42, y, z, 0.24, 0.05, 0.12, 12, enamel);
  b.box(x - 0.42, y - 0.09, z, 0.08, 0.09, 0.08, { tile: T.bulb, color: WHITE, data: [0, 0] });
  pools.quad([x - 1.6, 0.012, z - 0.8], [1.5, 0, 0], [0, 0, 1.6], {
    color: [0.62, 0.48, 0.28],
    data: [0.3, 0],
  });
}

/**
 * Galvanised dryer duct of a laundromat: a flange and a stub out of the wall at `y0`, then up the
 * facade on clamps to `y1`, where a conical rain cap tops it.
 */
export function buildDryerDuct(atlas, b, x, z, y0, y1) {
  const T = atlas.tiles;
  const steel = { tile: T.metal, color: [0.66, 0.68, 0.7] };
  const dark = { tile: T.metal, color: [0.36, 0.38, 0.4] };
  const r = 0.1;
  const dx = x - 0.17;
  b.box(x - 0.02, y0 - 0.15, z, 0.04, 0.3, 0.3, steel);
  tube(b, x - 0.02, y0, z, dx, y0, z, r, r, 8, steel);
  b.cylinderY(dx, y0 - r - 0.02, z, r + 0.01, r + 0.01, r * 2 + 0.04, 8, steel);
  b.cylinderY(dx, y0 + r + 0.02, z, r, r, y1 - y0 - r - 0.02, 8, steel, false);
  for (let y = y0 + 1.0; y < y1 - 0.4; y += 1.25) {
    b.box((x + dx) * 0.5, y, z, x - dx, 0.05, 0.04, dark);
    b.cylinderY(dx, y, z, r + 0.015, r + 0.015, 0.05, 8, dark);
  }
  b.cylinderY(dx, y1, z, 0.02, 0.02, 0.1, 4, dark);
  b.cylinderY(dx, y1 + 0.1, z, r * 1.8, 0.02, 0.12, 8, steel);
}

/** Galvanised trash can with a ribbed body and a lid with a handle, `x, z` its centre. */
export function buildTrashCan(atlas, b, x, z) {
  const T = atlas.tiles;
  const zinc = { tile: T.metal, color: [0.6, 0.62, 0.63] };
  b.cylinderY(x, 0, z, 0.21, 0.24, 0.68, 10, zinc);
  for (const y of [0.18, 0.48]) b.cylinderY(x, y, z, 0.245, 0.245, 0.03, 10, zinc);
  b.cylinderY(x, 0.68, z, 0.26, 0.24, 0.05, 10, { tile: T.metal, color: [0.52, 0.54, 0.55] });
  b.box(x, 0.73, z, 0.04, 0.04, 0.16, { tile: T.metal, color: CHARCOAL_IRON });
}

/**
 * Blue street mailbox on four legs: the box with its rounded top, the pull-down chute flap
 * facing the sidewalk, a pickup plate on its side. `x, z` is its centre at the curb.
 */
export function buildMailbox(atlas, b, x, z) {
  const T = atlas.tiles;
  const blue = { tile: T.metal, color: [0.12, 0.2, 0.42] };
  const dark = { tile: T.metal, color: [0.08, 0.12, 0.24] };
  for (const sx of [-0.15, 0.15]) {
    for (const sz of [-0.19, 0.19]) b.box(x + sx, 0, z + sz, 0.04, 0.42, 0.04, dark);
  }
  b.box(x, 0.42, z, 0.44, 0.66, 0.5, blue);
  // Rounded top: a cylinder along X sunk half into the box, the box's width across Z
  b.cylinderX(x, 1.08, z, 0.25, 0.436, 10, blue);
  // Chute flap with its handle toward the sidewalk (+X), the pickup plate on the street side
  b.box(x + 0.225, 0.86, z, 0.02, 0.16, 0.36, dark);
  b.box(x + 0.24, 0.92, z, 0.02, 0.03, 0.16, { tile: T.metal, color: [0.7, 0.72, 0.74] });
  b.box(x - 0.225, 0.56, z, 0.012, 0.3, 0.26, { tile: T.white, color: [0.86, 0.86, 0.82] });
}

/**
 * Pair of rooftop ventilation units of a centrally ventilated building (the hotel): steel
 * casings on a frame of rails, louvred sides and a round fan on top of each. `y` is the roof
 * surface under them.
 */
export function buildRooftopUnits(atlas, b, x, z, y, gap = 1.6) {
  const T = atlas.tiles;
  const steel = { tile: T.metal, color: [0.6, 0.62, 0.62] };
  const dark = { tile: T.metal, color: [0.3, 0.32, 0.33] };
  for (const sz of [-1, 1]) b.box(x, y, z + sz * (gap * 0.5 + 0.1), 1.3, 0.12, 0.08, dark);
  for (const sz of [-0.5, 0.5]) {
    const uz = z + sz * gap;
    b.box(x, y + 0.12, uz, 1.0, 0.72, 1.0, {
      ...steel,
      faces: {
        nx: { tile: T.vent, color: [0.72, 0.74, 0.74], rep: [1, 1] },
        px: { tile: T.vent, color: [0.72, 0.74, 0.74], rep: [1, 1] },
      },
    });
    b.cylinderY(x, y + 0.84, uz, 0.36, 0.36, 0.06, 10, dark);
    b.cylinderY(x, y + 0.9, uz, 0.08, 0.05, 0.05, 6, steel);
  }
}

/** Gas / electric meter cabinet on a flank wall, `y` its foot. */
export function buildMeterBox(atlas, b, x, z, y) {
  const T = atlas.tiles;
  b.box(x - 0.09, y, z, 0.18, 0.62, 0.48, {
    tile: T.metal,
    color: [0.58, 0.6, 0.58],
    faces: { nx: { tile: T.meter_box, color: WHITE, rep: [1, 1] } },
  });
  b.box(x - 0.03, 0.05, z + 0.16, 0.06, y - 0.05, 0.05, {
    tile: T.metal,
    color: [0.36, 0.37, 0.38],
  });
}

/**
 * Wrought-iron wall bracket with a hanging carriage lantern (lit at night), `y` the lantern's
 * foot; its light falls on the ground at `groundY` (none for `null`: a lantern by a door on
 * the street, where only the street lamps light the sidewalk).
 */
export function buildBracketLantern(atlas, b, pools, x, z, y, groundY = 0) {
  const T = atlas.tiles;
  const iron = { tile: T.metal, color: CHARCOAL_IRON };
  b.box(x - 0.015, y + 0.12, z, 0.03, 0.34, 0.1, iron);
  b.box(x - 0.24, y + 0.44, z, 0.48, 0.035, 0.035, iron);
  tube(b, x - 0.02, y + 0.16, z, x - 0.34, y + 0.44, z, 0.012, 0.012, 4, iron);
  b.box(x - 0.42, y + 0.32, z, 0.012, 0.12, 0.012, iron);
  b.box(x - 0.42, y + 0.28, z, 0.2, 0.05, 0.2, iron);
  b.box(x - 0.42, y + 0.04, z, 0.15, 0.24, 0.15, { tile: T.bulb, color: WHITE, data: [0, 0] });
  b.box(x - 0.42, y, z, 0.18, 0.04, 0.18, iron);
  if (groundY === null) return;
  pools.quad([x - 1.9, groundY + 0.012, z - 1.0], [1.8, 0, 0], [0, 0, 2.0], {
    color: [0.7, 0.52, 0.28],
    data: [0.4, 0],
  });
}

/**
 * Facade window air conditioner unit with metal casing, front louvres and support struts.
 */
export function buildWindowAirConditioner(atlas, b, x, y, z) {
  const T = atlas.tiles;
  // Metal housing box
  b.box(x - 0.24, y, z, 0.45, 0.38, 0.55, {
    tile: T.vent,
    color: [0.72, 0.75, 0.78],
    faces: { nx: { tile: T.vent, color: WHITE } },
  });
  // Diagonal steel mounting brackets below
  b.box(x - 0.2, y - 0.18, z, 0.35, 0.18, 0.04, {
    tile: T.metal,
    color: CHARCOAL_IRON,
  });
}
