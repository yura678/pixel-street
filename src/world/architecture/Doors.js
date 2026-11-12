/**
 * Doors built from geometry: panelled leaves and the doorway of a house or of the flats over a
 * shop (surround, transom or fanlight, number, intercom, lamps).
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { BRASS_TRIM, CHARCOAL_IRON, STONE_CORNICE, WHITE } from './palette.js';
import { archRing, arcZY, extrudeZY, orientedTri, tube } from './primitives.js';
import { buildBracketLantern } from './Services.js';

/**
 * Plan of an aedicule (Renaissance Revival portal) round an arched doorway `ow` wide: its
 * pilasters `pw` wide stand `pz` off the door's axis, the entablature starts `rise` above the
 * spring of the arch. The voussoirs reach `ring` out from the opening.
 */
export function aediculeSize(ow) {
  const r = ow * 0.5 + 0.03;
  const pw = 0.26;
  return { r, ring: r + 0.26, pw, pz: r + 0.3 + pw * 0.5, rise: r + 0.38 };
}

/**
 * Panelled timber door built from geometry (never a stretched texture): leaf slab,
 * raised lower panel, glazed or raised upper panel and a brass pull. `double` makes a
 * pair of leaves meeting in the middle. The leaf faces −X (the street). `paint` uses the
 * tintable painted-wood tile, so `color` is the paint colour (else natural timber).
 */
export function buildPanelledDoor(atlas, b, xFace, y0, cz, w, h, color, opts = {}) {
  const T = atlas.tiles;
  const wood = opts.paint ? T.wood_paint : T.wood;
  const leaves = opts.double ? 2 : 1;
  const lw = w / leaves;
  const panel = color.map((c) => c * 0.78);
  for (let i = 0; i < leaves; i++) {
    const lz = cz - w * 0.5 + (i + 0.5) * lw;
    const pw = lw - 0.22;
    b.box(xFace - 0.035, y0, lz, 0.07, h, lw - 0.015, { tile: wood, color, texScale: 0.6 });
    b.box(xFace - 0.075, y0 + 0.16, lz, 0.02, h * 0.3, pw, {
      tile: wood,
      color: panel,
      texScale: 0.5,
    });
    if (opts.glazed) {
      b.quad([xFace - 0.073, y0 + h * 0.52, lz - pw * 0.5], [0, 0, pw], [0, h * 0.38, 0], {
        tile: T.glass_panel,
        color: WHITE,
        data: [opts.glow ?? 1.6, 0],
      });
      b.box(xFace - 0.075, y0 + h * 0.52 + h * 0.19 - 0.015, lz, 0.015, 0.03, pw, {
        tile: wood,
        color,
      });
    } else {
      b.box(xFace - 0.075, y0 + h * 0.52, lz, 0.02, h * 0.38, pw, {
        tile: wood,
        color: panel,
        texScale: 0.5,
      });
    }
    const hz = leaves === 2 ? lz + (i === 0 ? 1 : -1) * (lw * 0.5 - 0.1) : lz + lw * 0.5 - 0.12;
    b.box(xFace - 0.095, y0 + h * 0.42, hz, 0.04, 0.2, 0.03, { tile: T.metal, color: BRASS_TRIM });
  }
}

/** The portico's entablature reaches this far past the front of its columns. */
const PORTICO_OVERHANG = 0.17;

/**
 * Plan of a Greek Revival portico before a doorway `ow` wide: its columns stand in front of the
 * antae (`cw` off the door's axis) `depth` out from the wall, the entablature reaches `ed` out.
 */
export function porticoSize(ow, depth = 0.62) {
  return { cw: ow * 0.5 + 0.13, ed: depth + PORTICO_OVERHANG };
}

/**
 * A house or flats entrance. Dark reveal, panelled leaves (single / double, glazed or not),
 * optional side lights, a transom – `rect` light or `fan` fanlight (Federal) – and a surround:
 * `pilasters` with an entablature (Greek Revival), `portal` (pilasters + pediment; `pediment:
 * 'broken'` – the Colonial Revival broken pediment with an urn in the gap, `'segmental'` – a
 * shallow curved pediment, Second Empire), `arch` (`archivolt`: a moulded roll round the
 * voussoirs, Romanesque)
 * (round-headed opening in voussoirs: Anglo-Italianate, Romanesque), `hood` (slab on scrolled
 * consoles: Italianate brownstone), `neoGrec` (grooved jambs, angular consoles and a massive
 * incised hood), `aedicule` (Renaissance Revival: the arch between two pilasters carrying an
 * entablature, a tall keystone up to it; it rises through the belt course over the ground
 * storey, which needs a gap there, `aediculeSize`) or none. House number on the transom or
 * beside the door, optional intercom and lantern (`lanterns`: a pair on brackets, on the
 * pilasters of an aedicule), with no light pool of their own.
 *
 * @param {object} o `{ x, z, y0 = 0, w = 1, h = 2.2, leaves = 1, color (paint; `stain: true` for
 *   natural varnished timber), glazed, sidelights,
 *   transom: 'rect'|'fan'|null, surround, trim, trimTile, number, numberOn: 'fan'|'entablature'|
 *   'keystone'|'panel'|'door', cartouche (over an arch), intercom, lamp, lanterns (neither throws a light
 *   pool: on the street only the street lamps light the sidewalk), stained: a tile of leaded stained glass for the transom and the
 *   fanlight (lit from the hall at dusk), deep: how far an arched surround stands out from the
 *   wall – the door then sits at the back of a deep arch (Queen Anne) }`
 * @returns {[number, number]} lot-local Z span to keep clear of street furniture
 */
export function buildDoorway(atlas, b, pools, o) {
  const T = atlas.tiles;
  const x = o.x;
  const z = o.z;
  const y0 = o.y0 ?? 0;
  const w = o.w ?? 1.0;
  const h = o.h ?? 2.2;
  const color = o.color ?? [0.2, 0.26, 0.22];
  // Surround in dressed stone, or rock-faced (`trimTile: 'stone_rockfaced'`, Romanesque)
  const trim = {
    tile: T[o.trimTile ?? 'wall_stone'],
    color: o.trim ?? STONE_CORNICE,
    texScale: o.trimTile ? 0.6 : 0.9,
  };
  const frame = {
    tile: o.stain ? T.wood : T.wood_paint,
    color: color.map((c) => c * 0.8),
    texScale: 0.6,
  };
  const dark = { tile: T.white, color: [0.08, 0.075, 0.07] };
  const side = o.sidelights ? 0.32 : 0;
  const ow = w + side * 2;
  const aedicule = o.surround === 'aedicule';
  const fan = o.transom === 'fan' || o.surround === 'arch' || aedicule;
  const tH = o.transom === 'rect' ? 0.38 : 0;
  const spring = y0 + h + tH + 0.07;
  const r = ow * 0.5 + 0.03;
  const top = fan ? spring + r : spring;

  // Reveal (with a half-round fanlight reveal over arched / fanlit doors)
  b.quad(
    [x - 0.012, y0 - 0.02, z - ow * 0.5 - 0.06],
    [0, 0, ow + 0.12],
    [0, spring - y0 + 0.02, 0],
    dark,
  );
  if (fan) {
    const arc = arcZY(z, spring, r + 0.03, 0, Math.PI, 10);
    for (let i = 0; i < 10; i++) {
      orientedTri(
        b,
        [x - 0.012, spring, z],
        [x - 0.012, arc[i][1], arc[i][0]],
        [x - 0.012, arc[i + 1][1], arc[i + 1][0]],
        [0, 0],
        [1, 0],
        [1, 1],
        [-1, 0, 0],
        dark,
      );
    }
  }

  buildPanelledDoor(atlas, b, x, y0, z, w, h, color, {
    double: o.leaves === 2,
    glazed: o.glazed,
    glow: o.glow,
    paint: !o.stain,
  });
  b.box(x - 0.04, y0 + h, z, 0.08, 0.07, ow + 0.04, frame);

  // Side lights: tall narrow glazing either side of the leaves
  if (side) {
    for (const s of [-1, 1]) {
      const sz = z + s * (w * 0.5 + side * 0.5);
      b.box(x - 0.04, y0, sz, 0.08, 0.34, side, frame);
      b.quad([x - 0.03, y0 + 0.34, sz - side * 0.5 + 0.05], [0, 0, side - 0.1], [0, h - 0.42, 0], {
        tile: T.glass_panel,
        color: WHITE,
        data: [1.4, 0],
      });
      b.box(x - 0.042, y0, z + s * (w * 0.5 + 0.02), 0.084, h, 0.05, frame);
    }
  }
  // Rectangular transom light, the house number painted in gilt on it – or leaded stained glass
  // (`stained`), its motif repeated square along the transom
  const stained = o.stained && T[o.stained];
  if (tH) {
    b.quad(
      [x - 0.03, y0 + h + 0.07, z - ow * 0.5],
      [0, 0, ow],
      [0, tH - 0.06, 0],
      stained
        ? {
            tile: stained,
            color: WHITE,
            rep: [Math.max(1, Math.round(ow / (tH - 0.06))), 1],
            data: [0, 0],
          }
        : { tile: T.glass_panel, color: WHITE, data: [1.6, 0] },
    );
    b.box(x - 0.04, y0 + h + tH, z, 0.08, 0.07, ow + 0.04, frame);
  }
  // Fanlight: half-round glass with radiating bars in a moulded frame; stained glass is mapped
  // flat across it at the transom's scale
  if (fan) {
    const arc = arcZY(z, spring, r - 0.06, 0, Math.PI, 10);
    const glass = stained
      ? { tile: stained, color: WHITE, data: [0, 0] }
      : { tile: T.glass_panel, color: WHITE, data: [1.6, 0] };
    const sq = stained ? Math.max(0.2, tH - 0.06 || 0.32) : 0;
    const fuv = (pz, py) => (stained ? [(pz - z + r) / sq, (py - spring) / sq] : null);
    for (let i = 0; i < 10; i++) {
      orientedTri(
        b,
        [x - 0.03, spring, z],
        [x - 0.03, arc[i][1], arc[i][0]],
        [x - 0.03, arc[i + 1][1], arc[i + 1][0]],
        fuv(z, spring) ?? [0, 0],
        fuv(arc[i][0], arc[i][1]) ?? [1, 0],
        fuv(arc[i + 1][0], arc[i + 1][1]) ?? [1, 1],
        [-1, 0, 0],
        glass,
      );
    }
    for (let i = 1; i < (stained ? 0 : 5); i++) {
      const a = (Math.PI * i) / 5;
      tube(
        b,
        x - 0.045,
        spring,
        z,
        x - 0.045,
        spring + Math.sin(a) * (r - 0.06),
        z + Math.cos(a) * (r - 0.06),
        0.012,
        0.012,
        4,
        frame,
      );
    }
    archRing(b, x - 0.07, x - 0.01, z, spring, r - 0.07, r, 0, Math.PI, 10, frame);
  }

  // Surround
  const pil = (top) => {
    for (const s of [-1, 1])
      b.box(x - 0.07, y0 - 0.02, z + s * (ow * 0.5 + 0.13), 0.14, top - y0 + 0.02, 0.2, trim);
  };
  if (o.surround === 'pilasters' || o.surround === 'portal') {
    pil(top);
    b.box(x - 0.08, top, z, 0.16, 0.24, ow + 0.5, trim);
    b.box(x - 0.13, top + 0.24, z, 0.26, 0.08, ow + 0.64, trim);
    if (o.surround === 'portal' && o.pediment === 'broken') {
      // Broken pediment (Colonial Revival): the raking halves stop short of the apex, an urn on
      // a pedestal stands in the gap
      const hw = ow * 0.5 + 0.3;
      const yb = top + 0.32;
      const gap = 0.2;
      const yIn = yb + 0.12 + (hw - gap) * 0.34;
      for (const s of [-1, 1]) {
        extrudeZY(
          b,
          x - 0.13,
          x + 0.02,
          [
            [z + s * gap, yb],
            [z + s * hw, yb],
            [z + s * hw, yb + 0.12],
            [z + s * gap, yIn],
          ],
          trim,
        );
      }
      b.box(x - 0.08, yb, z, 0.16, 0.2, 0.3, trim);
      b.cylinderY(x - 0.08, yb + 0.2, z, 0.06, 0.11, 0.16, 8, trim);
      b.cylinderY(x - 0.08, yb + 0.36, z, 0.11, 0.05, 0.07, 8, trim);
      b.cylinderY(x - 0.08, yb + 0.43, z, 0.035, 0.015, 0.08, 6, trim);
    } else if (o.surround === 'portal' && o.pediment === 'segmental') {
      // Segmental pediment (Second Empire): a shallow curved gable on the entablature, its
      // moulding running round the arc
      const hw = ow * 0.5 + 0.3;
      const rise = hw * 0.36;
      const rr = (hw * hw + rise * rise) / (2 * rise);
      const th = Math.asin(Math.min(1, hw / rr));
      const yb = top + 0.32;
      const yc = yb + rise - rr;
      const [a0, a1] = [Math.PI * 0.5 - th, Math.PI * 0.5 + th];
      extrudeZY(b, x - 0.13, x + 0.02, arcZY(z, yc, rr, a0, a1, 8), trim);
      archRing(b, x - 0.17, x - 0.02, z, yc, rr - 0.02, rr + 0.06, a0 - 0.03, a1 + 0.03, 8, trim);
    } else if (o.surround === 'portal') {
      const hw = ow * 0.5 + 0.3;
      extrudeZY(
        b,
        x - 0.13,
        x + 0.02,
        [
          [z - hw, top + 0.32],
          [z + hw, top + 0.32],
          [z, top + 0.32 + hw * 0.34],
        ],
        trim,
      );
    }
  } else if (o.surround === 'arch') {
    // A deep arch (`deep`) stands out from the wall: jambs and voussoirs as thick as its depth
    const dp = o.deep ?? 0;
    for (const s of [-1, 1]) {
      const jz = z + s * (ow * 0.5 + 0.12);
      b.box(x - 0.06 - dp * 0.5, y0 - 0.02, jz, 0.12 + dp, spring - y0 + 0.02, 0.2, trim);
      // The impost block's top stands 4 mm over the springing: jambs, door frames and rolls
      // stop at that line
      b.box(x - 0.09 - dp * 0.5, spring - 0.1, jz, 0.18 + dp, 0.104, 0.28, trim);
    }
    archRing(b, x - 0.1 - dp, x + 0.02, z, spring, r + 0.02, r + 0.26, 0, Math.PI, 11, trim, true);
    if (o.archivolt) {
      // Romanesque archivolt: a smooth moulded roll round the voussoirs, standing proud of them,
      // dying into short imposts on the wall either side
      const roll = { tile: T.wall_stone, color: o.trim ?? STONE_CORNICE, texScale: 0.9 };
      archRing(b, x - 0.16 - dp, x - 0.04, z, spring, r + 0.26, r + 0.38, 0, Math.PI, 12, roll);
      for (const s of [-1, 1]) {
        b.box(x - 0.1 - dp * 0.5, spring - 0.14, z + s * (r + 0.32), 0.2 + dp, 0.14, 0.2, roll);
      }
    }
    if (o.cartouche) {
      // Carved cartouche over the crown: a shield in a scrolled frame
      const cy = spring + r + 0.18;
      b.box(x - 0.12, cy, z, 0.1, 0.5, 0.56, trim);
      b.box(x - 0.17, cy + 0.08, z, 0.06, 0.34, 0.36, {
        ...trim,
        color: (o.trim ?? STONE_CORNICE).map((c) => c * 0.86),
      });
      for (const s of [-1, 1]) b.cylinderX(x - 0.15, cy + 0.38, z + s * 0.27, 0.07, 0.06, 8, trim);
    }
  } else if (aedicule) {
    // Renaissance Revival portal: the arch in plain voussoirs on imposts, a tall keystone rising
    // from its crown to the entablature, carried by two pilasters on pedestals
    const { pw, pz, rise } = aediculeSize(ow);
    const yE = spring + rise;
    for (const s of [-1, 1]) {
      const jz = z + s * (ow * 0.5 + 0.12);
      b.box(x - 0.06, y0 - 0.02, jz, 0.12, spring - y0 + 0.02, 0.2, trim);
      b.box(x - 0.09, spring - 0.1, jz, 0.18, 0.104, 0.28, trim);
      const pzc = z + s * pz;
      b.box(x - 0.1, y0 - 0.02, pzc, 0.2, 0.42, pw + 0.08, trim);
      b.box(x - 0.07, y0 + 0.4, pzc, 0.14, yE - y0 - 0.58, pw, trim);
      b.box(x - 0.1, yE - 0.18, pzc, 0.2, 0.08, pw + 0.06, trim);
      b.box(x - 0.11, yE - 0.1, pzc, 0.22, 0.1, pw + 0.1, trim);
    }
    archRing(b, x - 0.1, x + 0.02, z, spring, r + 0.02, r + 0.26, 0, Math.PI, 11, trim);
    // Keystone: wider at the top, standing proud of the voussoirs, up to the architrave
    extrudeZY(
      b,
      x - 0.17,
      x + 0.02,
      [
        [z - 0.11, spring + r - 0.04],
        [z + 0.11, spring + r - 0.04],
        [z + 0.15, yE],
        [z - 0.15, yE],
      ],
      trim,
    );
    // Entablature: architrave, frieze, cornice and its cap
    const ew = (pz + pw * 0.5) * 2 + 0.1;
    b.box(x - 0.11, yE, z, 0.22, 0.16, ew, trim);
    b.box(x - 0.09, yE + 0.16, z, 0.18, 0.2, ew - 0.06, trim);
    b.box(x - 0.17, yE + 0.36, z, 0.34, 0.1, ew + 0.16, trim);
    b.box(x - 0.13, yE + 0.46, z, 0.26, 0.06, ew + 0.06, trim);
  } else if (o.surround === 'hood') {
    for (const s of [-1, 1]) {
      const cz = z + s * (ow * 0.5 + 0.16);
      b.box(x - 0.06, y0 - 0.02, cz, 0.12, top - y0 - 0.38, 0.18, trim);
      b.box(x - 0.13, top - 0.4, cz, 0.26, 0.42, 0.16, trim);
      b.box(x - 0.202, top - 0.12, cz, 0.124, 0.14, 0.14, trim);
    }
    b.box(x - 0.17, top + 0.02, z, 0.34, 0.12, ow + 0.72, trim);
    b.box(x - 0.21, top + 0.14, z, 0.42, 0.07, ow + 0.82, trim);
  } else if (o.surround === 'portico') {
    // Greek Revival portico on the stoop's landing: two Doric columns stand out before antae on
    // the wall and carry an entablature back to it – architrave, a frieze of triglyphs (the
    // middle left plain for the number), a cornice; the architrave's soffit is the porch ceiling
    pil(top);
    const { cw, ed } = porticoSize(ow, o.porticoDepth);
    const xc = x - ed + PORTICO_OVERHANG;
    for (const s of [-1, 1]) {
      const cz = z + s * cw;
      // A fluted-looking shaft (no base: Greek Doric) tapering up, the echinus and the abacus
      b.cylinderY(xc, y0, cz, 0.115, 0.095, top - y0 - 0.13, 10, trim);
      b.cylinderY(xc, top - 0.13, cz, 0.095, 0.14, 0.07, 10, trim);
      b.box(xc, top - 0.06, cz, 0.3, 0.06, 0.3, trim);
    }
    const ew = cw * 2 + 0.36;
    b.box(x - ed * 0.5, top, z, ed, 0.2, ew, trim);
    b.box(x - ed * 0.5 + 0.005, top + 0.2, z, ed - 0.01, 0.28, ew - 0.02, trim);
    const glyph = { ...trim, color: (o.trim ?? STONE_CORNICE).map((c) => c * 0.82) };
    for (const tz of [-cw, -cw * 0.5, cw * 0.5, cw]) {
      b.box(x - ed - 0.008, top + 0.22, z + tz, 0.03, 0.24, 0.11, glyph);
    }
    b.box(x - (ed + 0.08) * 0.5, top + 0.48, z, ed + 0.08, 0.1, ew + 0.16, trim);
    b.box(x - (ed + 0.05) * 0.5, top + 0.58, z, ed + 0.05, 0.05, ew + 0.1, trim);
  } else if (o.surround === 'neoGrec') {
    // Neo-Grec portal: broad flat jambs standing proud with grooves cut down them, angular
    // consoles stepped out under a massive lintel hood whose face is incised, a raised tablet
    // stepped up on its cornice
    const groove = { tile: T.white, color: (o.trim ?? STONE_CORNICE).map((c) => c * 0.45) };
    const jw = 0.3;
    for (const s of [-1, 1]) {
      const jz = z + s * (ow * 0.5 + 0.06 + jw * 0.5);
      b.box(x - 0.08, y0 - 0.02, jz, 0.16, top - y0 - 0.48, jw, trim);
      for (const g of [-0.07, 0.07]) {
        b.quad(
          [x - 0.161, y0 + 0.3, jz + g - 0.012],
          [0, 0, 0.024],
          [0, top - y0 - 1.0, 0],
          groove,
        );
      }
      b.box(x - 0.1, top - 0.5, jz, 0.2, 0.18, jw - 0.1, trim);
      b.box(x - 0.13, top - 0.32, jz, 0.26, 0.3, jw - 0.02, trim);
    }
    const hw = ow + 0.84;
    b.box(x - 0.15, top - 0.02, z, 0.3, 0.3, hw, trim);
    for (const gy of [0.08, 0.19]) {
      b.quad(
        [x - 0.301, top - 0.02 + gy, z - hw * 0.5 + 0.14],
        [0, 0, hw - 0.28],
        [0, 0.016, 0],
        groove,
      );
    }
    b.box(x - 0.19, top + 0.28, z, 0.38, 0.08, hw + 0.1, trim);
    b.box(x - 0.16, top + 0.36, z, 0.32, 0.12, ow * 0.6, trim);
  }

  // House number: gilt on the transom, else an enamel plaque beside the door – or, by
  // `numberOn`, in the fanlight (`fan`), cut into the entablature of the portal, in a
  // terracotta tablet over the arch (`panel`) or in brass numerals on the door itself (`door`)
  const plaque = o.number && T[`plaque_${o.number}`];
  const tablet = o.numberOn === 'panel' && o.number && T[`tablet_${o.number}`];
  const numerals = o.numberOn === 'door' && o.number && T[`numerals_${o.number}`];
  if (tablet) {
    // Clear of the arch's keystone
    const ty = o.surround === 'arch' ? spring + r + 0.46 : top + 0.16;
    b.box(x - 0.04, ty - 0.06, z, 0.08, 0.44, 0.76, {
      tile: T.terracotta,
      color: [0.78, 0.46, 0.32],
      texScale: 0.4,
    });
    b.box(x - 0.09, ty, z, 0.02, 0.32, 0.64, {
      tile: T.terracotta,
      color: [0.78, 0.46, 0.32],
      texScale: 0.4,
      faces: { nx: { tile: tablet, color: [0.86, 0.56, 0.42], rep: [1, 1] } },
    });
  } else if (numerals) {
    // On the upper panel of the leaf, at eye height
    b.quad([x - 0.093, y0 + h * 0.62, z - 0.16], [0, 0, 0.32], [0, 0.16, 0], {
      tile: numerals,
      color: color.map((c) => c * 0.9),
    });
  } else if (plaque) {
    const onTransom = Boolean(tH);
    let py = onTransom ? y0 + h + 0.1 : y0 + 1.45;
    let pz = onTransom ? z : z + ow * 0.5 + 0.38;
    let px = onTransom ? 0.035 : 0.02;
    if (o.numberOn === 'fan' && fan) {
      py = spring + 0.05;
      pz = z;
      px = 0.035;
    } else if (o.numberOn === 'entablature' && o.surround === 'portico') {
      // In the plain middle of the portico's frieze
      py = top + 0.21;
      pz = z;
      px = porticoSize(ow, o.porticoDepth).ed + 0.002;
    } else if (o.numberOn === 'entablature' && o.surround) {
      py = top + 0.01;
      pz = z;
      px = 0.175;
    } else if (o.numberOn === 'keystone' && o.surround === 'arch') {
      py = spring + r + 0.04;
      pz = z;
      px = 0.145 + (o.deep ?? 0);
    } else if (o.numberOn === 'keystone' && aedicule) {
      // On the face of the tall keystone, a hair proud of it
      py = spring + r + 0.08;
      pz = z;
      px = 0.182;
    }
    b.box(x - px, py, pz, 0.02, 0.26, 0.26, {
      tile: T.metal,
      color: CHARCOAL_IRON,
      faces: { nx: { tile: plaque, color: WHITE, rep: [1, 1], data: [2.5, 0] } },
    });
  }
  // An aedicule carries the intercom and its lanterns on the faces of its pilasters
  const ae = aedicule ? aediculeSize(ow) : null;
  if (o.intercom) {
    const iz = ae ? z - ae.pz : z - ow * 0.5 - 0.36;
    const ix = ae ? x - 0.14 : x;
    b.box(ix - 0.025, y0 + 1.05, iz, 0.05, 0.36, 0.17, {
      tile: T.metal,
      color: [0.62, 0.63, 0.62],
    });
    for (let k = 0; k < 3; k++) {
      b.box(ix - 0.055, y0 + 1.12 + k * 0.08, iz, 0.02, 0.04, 0.1, {
        tile: T.white,
        color: [0.2, 0.21, 0.22],
      });
    }
  }
  if (o.lanterns) {
    const lz = ae ? ae.pz : ow * 0.5 + 0.42;
    const lx = ae ? x - 0.14 : x;
    for (const s of [-1, 1]) {
      buildBracketLantern(atlas, b, pools, lx, z + s * lz, y0 + 1.62, null);
    }
  }
  if (o.lamp && o.surround === 'portico') {
    // A lantern hung from the porch ceiling on a short chain
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    const lx = x - porticoSize(ow, o.porticoDepth).ed * 0.5;
    b.box(lx, top - 0.22, z, 0.015, 0.22, 0.015, iron);
    b.box(lx, top - 0.5, z, 0.16, 0.24, 0.16, { tile: T.bulb, color: WHITE, data: [2.5, 0] });
    b.box(lx, top - 0.26, z, 0.2, 0.04, 0.2, iron);
  } else if (o.lamp) {
    const lz = z + ow * 0.5 + 0.42;
    const iron = { tile: T.metal, color: CHARCOAL_IRON };
    b.box(x - 0.1, top - 0.32, lz, 0.2, 0.04, 0.04, iron);
    b.box(x - 0.22, top - 0.56, lz, 0.15, 0.22, 0.15, {
      tile: T.bulb,
      color: WHITE,
      data: [2.5, 0],
    });
    b.box(x - 0.22, top - 0.34, lz, 0.19, 0.04, 0.19, iron);
  }
  // No light pool on the step: on the street only the street lamps light the sidewalk
  return [z - ow * 0.5 - 0.45, z + ow * 0.5 + 0.45];
}
