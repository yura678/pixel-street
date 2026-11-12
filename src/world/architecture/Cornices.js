/**
 * Building crowns: bracketed Italianate cornice, simple dentil cornice, Neo-Grec cornice with
 * angular brackets and incised frieze panels, a balustraded cornice (Renaissance Revival), the
 * Romanesque corbel table (arcature of small arches), a light cast-iron cornice, the tall
 * pressed-metal cornice of a tenement and the brownstone's frieze with attic windows between
 * paired brackets.
 *
 * Every builder emits into a `MeshBuilder` in lot-local space (facade faces −X).
 */
import { STONE_CORNICE } from './palette.js';
import { archRing, extrudeZY, orientedTri } from './primitives.js';

/**
 * Rowhouse crown. `simple`: dentil band + coping (grey ashlar house). `bracket`: deep
 * Italianate cornice – frieze, scroll brackets and an overhanging cap.
 */
export function buildCornice(atlas, b, facadeX, h, cz, w, seg, wallTile) {
  const T = atlas.tiles;
  const stone = (color) => ({ tile: T.wall_stone, color, texScale: 0.9 });
  // A taxpayer's parapet is its crown (`Roofs.buildParapet`)
  if (seg.cornice === 'none') return;
  if (seg.cornice === 'bracket') {
    const col = seg.corniceCol ?? [0.36, 0.32, 0.29];
    b.box(facadeX - 0.06, h - 0.86, cz, 0.12, 0.42, w, {
      tile: wallTile,
      color: seg.color.map((c) => c * 0.9),
      texScale: seg.texScale ?? 1.4,
    });
    b.box(facadeX - 0.08, h - 0.9, cz, 0.16, 0.06, w + 0.02, stone(col));
    // `seg.corniceBrackets: 'small'` – a close row of small brackets (Anglo-Italianate)
    const small = seg.corniceBrackets === 'small';
    const n = small ? Math.max(5, Math.round(w / 0.5)) : Math.max(3, Math.round(w / 1.15));
    for (let i = 0; i <= n; i++) {
      const z = cz - w * 0.5 + 0.22 + ((w - 0.44) * i) / n;
      if (small) {
        b.box(facadeX - 0.12, h - 0.74, z, 0.2, 0.3, 0.09, stone(col));
        b.box(facadeX - 0.2, h - 0.52, z, 0.08, 0.08, 0.1, stone(col));
        continue;
      }
      b.box(facadeX - 0.17, h - 0.8, z, 0.3, 0.38, 0.13, stone(col));
      b.box(facadeX - 0.27, h - 0.52, z, 0.12, 0.1, 0.15, stone(col));
    }
    b.box(facadeX - 0.2, h - 0.44, cz, 0.44, 0.16, w + 0.12, stone(col));
    b.box(facadeX - 0.16, h - 0.28, cz, 0.36, 0.1, w + 0.08, stone(col.map((c) => c * 0.86)));
    return;
  }
  if (seg.cornice === 'neoGrec') {
    // Sheet-metal Neo-Grec cornice: incised frieze panels between angular brackets
    // (`seg.corniceBays` panels; the middle one carries the date tablet `seg.date`);
    // `seg.corniceBrackets: 'stepped'` – narrow stepped brackets with flutes and drops
    const col = seg.corniceCol ?? [0.36, 0.32, 0.29];
    const n = seg.corniceBays ?? Math.max(2, Math.round(w / 1.6));
    const pitch = (w - 0.3) / n;
    b.box(facadeX - 0.08, h - 0.947, cz, 0.16, 0.597, w, stone(col));
    for (let i = 0; i < n; i++) {
      const z = cz - w * 0.5 + 0.15 + pitch * (i + 0.5);
      b.quad(
        [facadeX - 0.161, h - 0.88, z - pitch * 0.5 + 0.18],
        [0, 0, pitch - 0.36],
        [0, 0.46, 0],
        {
          tile: T.incised_panel,
          color: col.map((c) => Math.min(1, c * 1.25)),
          rep: [1, 1],
        },
      );
      if (seg.date && n % 2 === 1 && i === (n - 1) >> 1) {
        // Date tablet (2:1) standing proud of the middle panel
        b.box(facadeX - 0.18, h - 0.86, z, 0.04, 0.42, 0.84, {
          ...stone(col),
          faces: {
            nx: { tile: seg.date, color: col.map((c) => Math.min(1, c * 1.3)), rep: [1, 1] },
          },
        });
      }
    }
    for (let i = 0; i <= n; i++) {
      const z = cz - w * 0.5 + 0.15 + pitch * i;
      if (seg.corniceBrackets === 'stepped') {
        // A rowhouse's brackets: narrow and stepped – a shallow shaft with two cut flutes, a
        // deeper block under the corona, a little pyramid drop hanging below the frieze
        const dark = stone(col.map((c) => c * 0.55));
        b.box(facadeX - 0.14, h - 1.02, z, 0.12, 0.42, 0.13, stone(col));
        b.box(facadeX - 0.19, h - 0.6, z, 0.22, 0.12, 0.14, stone(col));
        b.box(facadeX - 0.24, h - 0.48, z, 0.32, 0.15, 0.15, stone(col));
        for (const s of [-0.03, 0.03]) {
          b.quad([facadeX - 0.201, h - 0.98, z + s - 0.01], [0, 0, 0.02], [0, 0.34, 0], dark);
        }
        b.cylinderY(facadeX - 0.14, h - 1.12, z, 0.01, 0.07, 0.1, 4, stone(col));
        continue;
      }
      b.box(facadeX - 0.2, h - 0.95, z, 0.24, 0.62, 0.16, stone(col));
      b.box(facadeX - 0.32, h - 0.45, z, 0.16, 0.12, 0.18, stone(col));
    }
    b.box(facadeX - 0.2, h - 0.33, cz, 0.44, 0.14, w + 0.14, stone(col));
    b.box(facadeX - 0.14, h - 0.19, cz, 0.32, 0.19, w + 0.06, stone(col.map((c) => c * 0.86)));
    return;
  }
  if (seg.cornice === 'balustrade') {
    // Modillion cornice with a stone balustrade on top
    const col = seg.corniceCol ?? STONE_CORNICE;
    b.box(facadeX - 0.06, h - 0.62, cz, 0.12, 0.3, w, stone(col));
    for (let z = cz - w * 0.5 + 0.2; z <= cz + w * 0.5 - 0.2; z += 0.36) {
      b.box(facadeX - 0.16, h - 0.36, z, 0.22, 0.1, 0.12, stone(col));
    }
    b.box(facadeX - 0.18, h - 0.26, cz, 0.4, 0.14, w + 0.12, stone(col));
    b.box(facadeX + 0.1, h - 0.12, cz, 0.3, 0.12, w, stone(col));
    for (let z = cz - w * 0.5 + 0.3; z <= cz + w * 0.5 - 0.3; z += 0.2) {
      b.cylinderY(facadeX + 0.1, h, z, 0.05, 0.065, 0.48, 6, stone(col));
    }
    for (const z of [cz - w * 0.5 + 0.124, cz, cz + w * 0.5 - 0.124]) {
      b.box(facadeX + 0.1, h, z, 0.28, 0.5, 0.24, stone(col));
    }
    b.box(facadeX + 0.1, h + 0.48, cz, 0.32, 0.09, w, stone(col));
    return;
  }
  if (seg.cornice === 'corbelTable') {
    // Romanesque arcature: a row of small round arches on corbels, a brick band above
    const brick = { tile: wallTile, color: seg.color, texScale: seg.texScale ?? 1.2 };
    const col = seg.corniceCol ?? seg.color.map((c) => c * 0.8);
    const n = Math.max(3, Math.round(w / 0.5));
    const pitch = w / n;
    for (let i = 0; i <= n; i++) {
      const z = cz - w * 0.5 + pitch * i;
      b.box(facadeX - 0.07, h - 0.72, z, 0.14, 0.16, 0.12, stone(col));
    }
    for (let i = 0; i < n; i++) {
      const z = cz - w * 0.5 + pitch * (i + 0.5);
      archRing(
        b,
        facadeX - 0.1,
        facadeX,
        z,
        h - 0.56,
        pitch * 0.5 - 0.06,
        pitch * 0.5 + 0.02,
        0,
        Math.PI,
        5,
        stone(col),
      );
    }
    b.box(facadeX - 0.06, h - 0.42, cz, 0.12, 0.3, w, brick);
    b.box(facadeX - 0.12, h - 0.12, cz, 0.24, 0.12, w + 0.06, stone(col));
    if (seg.date) {
      // A low brick gable over the middle with stone copings on its rakes and the building
      // date in a terracotta tablet
      const hw = Math.min(1.5, w * 0.22);
      const y1 = h + 0.3;
      const apex = y1 + hw * 0.3;
      extrudeZY(
        b,
        facadeX - 0.1,
        facadeX + 0.14,
        // (its foot 3 mm down into the band and the wall head: the roof deck lies at `h`)
        [
          [cz - hw, h - 0.003],
          [cz + hw, h - 0.003],
          [cz + hw, y1],
          [cz, apex],
          [cz - hw, y1],
        ],
        brick,
      );
      const k = (apex - y1) / hw;
      for (const s of [-1, 1]) {
        const ze = cz + s * (hw + 0.06);
        const ye = y1 - 0.06 * k;
        extrudeZY(
          b,
          facadeX - 0.14,
          facadeX + 0.16,
          s < 0
            ? [
                [ze, ye],
                [cz, apex],
                [cz, apex + 0.1],
                [ze, ye + 0.1],
              ]
            : [
                [cz, apex],
                [ze, ye],
                [ze, ye + 0.1],
                [cz, apex + 0.1],
              ],
          stone(col),
        );
      }
      b.box(facadeX - 0.12, h + 0.08, cz, 0.04, 0.36, 0.72, {
        tile: T.terracotta,
        color: [0.82, 0.5, 0.36],
        texScale: 0.4,
        faces: { nx: { tile: seg.date, color: [0.86, 0.56, 0.42], rep: [1, 1] } },
      });
    }
    return;
  }
  if (seg.cornice === 'italianate') {
    // Brownstone crown: a deep frieze in the wall material pierced by little attic windows over
    // the window axes (`seg.corniceAxes`), paired scroll brackets between them, a moulded cap
    const col = seg.corniceCol ?? [0.36, 0.3, 0.26];
    b.box(facadeX - 0.06, h - 1.12, cz, 0.12, 0.7, w, {
      tile: wallTile,
      color: seg.color.map((c) => c * 0.92),
      texScale: seg.texScale ?? 1.0,
    });
    b.box(facadeX - 0.09, h - 1.18, cz, 0.18, 0.06, w + 0.02, stone(col));
    const glass = { tile: T.white, color: [0.09, 0.095, 0.11] };
    for (const az of seg.corniceAxes ?? []) {
      const ww = 0.62;
      const wy = h - 0.95;
      const wh = 0.3;
      b.quad([facadeX - 0.124, wy, az - ww * 0.5], [0, 0, ww], [0, wh, 0], glass);
      for (const [dy, hh] of [
        [-0.05, 0.05],
        [wh, 0.05],
      ]) {
        b.box(facadeX - 0.14, wy + dy, az, 0.04, hh, ww + 0.1, stone(col));
      }
      for (const dz of [-ww * 0.5 - 0.025, -ww / 6, ww / 6, ww * 0.5 + 0.025]) {
        b.box(facadeX - 0.14, wy, az + dz, 0.04, wh, Math.abs(dz) > 0.2 ? 0.05 : 0.025, stone(col));
      }
    }
    // Bracket pairs at both ends and midway between the axes
    const axes = seg.corniceAxes ?? [];
    const edges = [cz - w * 0.5 + 0.22, cz + w * 0.5 - 0.22];
    for (let i = 0; i + 1 < axes.length; i++) edges.push((axes[i] + axes[i + 1]) * 0.5);
    for (const e of edges) {
      for (const s of [-0.12, 0.12]) {
        b.box(facadeX - 0.2, h - 1.1, e + s, 0.28, 0.66, 0.1, stone(col));
        b.box(facadeX - 0.32, h - 0.56, e + s, 0.13, 0.12, 0.12, stone(col));
        b.box(facadeX - 0.13, h - 1.24, e + s, 0.1, 0.14, 0.08, stone(col));
      }
    }
    b.box(facadeX - 0.22, h - 0.44, cz, 0.5, 0.16, w + 0.14, stone(col));
    b.box(facadeX - 0.17, h - 0.28, cz, 0.4, 0.12, w + 0.1, stone(col.map((c) => c * 0.86)));
    b.box(facadeX - 0.1, h - 0.16, cz, 0.24, 0.16, w + 0.04, stone(col.map((c) => c * 0.8)));
    return;
  }
  if (seg.cornice === 'tenement') {
    // Tall pressed sheet-metal cornice of a tenement, painted one colour: a deep frieze of
    // sunk panels between big scroll brackets with drops, a dentil course and the cap; the
    // middle panel (of an odd number) may carry a sunburst or the building date
    const col = seg.corniceCol ?? [0.2, 0.3, 0.24];
    const metal = stone(col);
    const n = seg.corniceBays ?? Math.max(3, Math.round(w / 1.25));
    const pitch = (w - 0.3) / n;
    // The frieze backing stops a hair short of the brackets' soffits and of window heads that
    // run up into it
    b.box(facadeX - 0.0705, h - 1.153, cz, 0.141, 0.783, w, metal);
    b.box(facadeX - 0.1, h - 1.2, cz, 0.18, 0.06, w + 0.02, metal);
    const sunk = { tile: T.white, color: col.map((c) => c * 0.62) };
    for (let i = 0; i < n; i++) {
      const z = cz - w * 0.5 + 0.15 + pitch * (i + 0.5);
      b.quad(
        [facadeX - 0.144, h - 1.03, z - pitch * 0.5 + 0.2],
        [0, 0, pitch - 0.4],
        [0, 0.48, 0],
        sunk,
      );
      const middle = n % 2 === 1 && i === (n - 1) >> 1;
      if (seg.date && middle) {
        // The building date (2:1) on a tablet standing proud of the middle panel
        b.box(facadeX - 0.17, h - 1.02, z, 0.04, 0.46, 0.92, {
          ...metal,
          faces: {
            nx: { tile: seg.date, color: col.map((c) => Math.min(1, c * 1.3)), rep: [1, 1] },
          },
        });
      } else if (seg.sunburst && middle) {
        // Sunburst in the middle panel: a disc of rays pressed in alternate shades, a boss
        const sy = h - 0.79;
        const rr = 0.22;
        const rays = 16;
        for (let k = 0; k < rays; k++) {
          const a0 = (Math.PI * 2 * k) / rays;
          const a1 = (Math.PI * 2 * (k + 1)) / rays;
          orientedTri(
            b,
            [facadeX - 0.15, sy, z],
            [facadeX - 0.15, sy + Math.sin(a0) * rr, z + Math.cos(a0) * rr],
            [facadeX - 0.15, sy + Math.sin(a1) * rr, z + Math.cos(a1) * rr],
            [0.5, 0.5],
            [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5],
            [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5],
            [-1, 0, 0],
            { tile: T.white, color: col.map((c) => Math.min(1, c * (k % 2 ? 0.78 : 1.3))) },
          );
        }
        b.cylinderX(facadeX - 0.16, sy, z, 0.065, 0.03, 8, metal);
      } else {
        b.box(facadeX - 0.16, h - 0.86, z, 0.04, 0.14, 0.14, metal);
      }
    }
    for (let i = 0; i <= n; i++) {
      const z = cz - w * 0.5 + 0.15 + pitch * i;
      b.box(facadeX - 0.21, h - 1.15, z, 0.28, 0.72, 0.17, metal);
      b.box(facadeX - 0.34, h - 0.58, z, 0.18, 0.16, 0.19, metal);
      b.box(facadeX - 0.15, h - 1.32, z, 0.14, 0.17, 0.12, metal);
    }
    b.box(facadeX - 0.25, h - 0.42, cz, 0.22, 0.12, w + 0.12, {
      tile: T.cornice_dentil,
      color: col.map((c) => Math.min(1, c * 1.2)),
      rep: [Math.max(3, Math.round(w / 0.6)), 1],
    });
    b.box(facadeX - 0.26, h - 0.3, cz, 0.58, 0.16, w + 0.2, metal);
    b.box(facadeX - 0.2, h - 0.14, cz, 0.46, 0.14, w + 0.14, stone(col.map((c) => c * 0.86)));
    return;
  }
  if (seg.cornice === 'castIron') {
    // Light painted-iron cornice: small brackets, a cap and a low central pediment
    const col = seg.corniceCol ?? [0.62, 0.58, 0.52];
    b.box(facadeX - 0.05, h - 0.5, cz, 0.1, 0.32, w, stone(col));
    for (let z = cz - w * 0.5 + 0.15; z <= cz + w * 0.5 - 0.15; z += 0.5) {
      b.box(facadeX - 0.13, h - 0.42, z, 0.16, 0.24, 0.08, stone(col));
    }
    b.box(facadeX - 0.15, h - 0.18, cz, 0.32, 0.1, w + 0.08, stone(col));
    b.box(facadeX - 0.1, h - 0.08, cz, 0.22, 0.08, w + 0.04, stone(col.map((c) => c * 0.88)));
    const hw = Math.min(1.4, w * 0.25);
    extrudeZY(
      b,
      facadeX - 0.1,
      facadeX + 0.1,
      [
        [cz - hw, h - 0.003],
        [cz + hw, h - 0.003],
        [cz, h + hw * 0.4],
      ],
      stone(col),
    );
    if (seg.date) {
      // The building date cast in a tablet in the pediment
      b.box(facadeX - 0.12, h + 0.06, cz, 0.04, 0.3, 0.6, {
        ...stone(col),
        faces: { nx: { tile: seg.date, color: col.map((c) => Math.min(1, c * 1.2)), rep: [1, 1] } },
      });
    }
    return;
  }
  if (seg.cornice === 'colonial') {
    // Colonial Revival: the dentil cornice of the town hall next door (a hair narrower, so the
    // two butt into one line instead of overlapping) under a white wooden roof balustrade
    const cw = w - 0.04;
    b.box(facadeX - 0.11, h - 0.4, cz, 0.26, 0.26, cw, {
      tile: T.cornice_dentil,
      color: STONE_CORNICE,
      rep: [Math.max(3, Math.round(w / 0.6)), 1],
    });
    b.box(facadeX - 0.02, h - 0.14, cz, 0.12, 0.14, cw, stone(STONE_CORNICE));
    const paint = {
      tile: T.wood_paint,
      color: seg.corniceCol ?? [0.92, 0.91, 0.87],
      texScale: 0.5,
    };
    const bx = facadeX + 0.06;
    b.box(bx, h - 0.003, cz, 0.24, 0.243, cw - 0.04, paint);
    const n = Math.max(2, Math.round(cw / 1.6));
    const posts = [];
    for (let i = 0; i <= n; i++) posts.push(cz - cw * 0.5 + 0.1 + ((cw - 0.2) * i) / n);
    for (const pz of posts) {
      b.box(bx, h + 0.24, pz, 0.18, 0.5, 0.18, paint);
      b.box(bx, h + 0.74, pz, 0.22, 0.05, 0.22, paint);
    }
    for (let i = 0; i < n; i++) {
      const za = posts[i] + 0.15;
      const zb = posts[i + 1] - 0.15;
      for (let z = za; z <= zb + 1e-6; z += (zb - za) / Math.max(1, Math.round((zb - za) / 0.15))) {
        b.cylinderY(bx, h + 0.24, z, 0.03, 0.04, 0.38, 6, paint);
      }
      b.box(bx, h + 0.62, (za + zb) * 0.5, 0.16, 0.07, zb - za + 0.3, paint);
    }
    return;
  }
  if (seg.cornice === 'paired') {
    // Second Empire hotel crown: a frieze in the wall material, paired scroll brackets at the
    // corners and over every pier between the window axes, a dentil course and a deep corona
    const col = seg.corniceCol ?? STONE_CORNICE;
    b.box(facadeX - 0.06, h - 0.9, cz, 0.12, 0.5, w, {
      tile: wallTile,
      color: seg.color.map((c) => c * 0.94),
      texScale: seg.texScale ?? 1.0,
    });
    b.box(facadeX - 0.09, h - 0.95, cz, 0.18, 0.06, w + 0.02, stone(col));
    const axes = seg.corniceAxes ?? [];
    const piers = [cz - w * 0.5 + 0.28, cz + w * 0.5 - 0.28];
    for (let i = 0; i + 1 < axes.length; i++) piers.push((axes[i] + axes[i + 1]) * 0.5);
    for (const p of piers) {
      for (const s of [-0.11, 0.11]) {
        b.box(facadeX - 0.18, h - 0.88, p + s, 0.26, 0.5, 0.09, stone(col));
        b.box(facadeX - 0.3, h - 0.46, p + s, 0.12, 0.1, 0.11, stone(col));
        b.box(facadeX - 0.11, h - 1.06, p + s, 0.08, 0.12, 0.07, stone(col));
      }
    }
    b.box(facadeX - 0.24, h - 0.38, cz, 0.14, 0.06, w + 0.12, {
      tile: T.cornice_dentil,
      color: col,
      rep: [Math.max(3, Math.round(w / 0.6)), 1],
    });
    b.box(facadeX - 0.22, h - 0.32, cz, 0.5, 0.16, w + 0.16, stone(col));
    b.box(facadeX - 0.16, h - 0.16, cz, 0.38, 0.16, w + 0.1, stone(col.map((c) => c * 0.86)));
    return;
  }
  // Within the lot: a neighbour with the same crown at the same height would share its faces
  b.box(facadeX - 0.11, h - 0.4, cz, 0.26, 0.26, w - 0.002, {
    tile: T.cornice_dentil,
    color: STONE_CORNICE,
    rep: [Math.max(3, Math.round(w / 0.6)), 1],
  });
  b.box(facadeX - 0.04, h - 0.14, cz, 0.08, 0.14, w - 0.002, stone(STONE_CORNICE));
}
