/**
 * High-detail procedural miniature & pixel-art texture generator.
 *
 *  - createAsphaltTexture()  – tileable 256² (4 m × 4 m) smooth weathered asphalt with hairline cracks.
 *  - createCobbleTexture()   – tileable 256² (2 m × 2 m) bevelled architectural stone sidewalk slabs.
 *  - createFacadeAtlas()     – 2048² atlas (128 px cells): Flemish brickwork with kiln variation,
 *                              multi-layer weathered stucco, grained clapboard siding, bush-hammered
 *                              ashlar & quoins, patinated roll-up shutters, distinct open-shop /
 *                              heritage-house / steel-service doors, multi-pane sash & arched windows,
 *                              herringbone alley cobbles, slate shingles, zinc standing-seam roofs,
 *                              chalkboard menus, utility meters, tire treads, radiator grilles, and
 *                              framed shop signboards.
 *                              Companion `maskMap` channels:
 *                                R = window / display glass (warm interior light)
 *                                G = bulbs / sconces / neon / "OPEN" plaques
 *                                B = vertex-colour palette tint mask (1 = tint, 0 = keep raw colour)
 */
import * as THREE from 'three/webgpu';
import { Rng } from '../core/random.js';
import { SHOP_SIGNS, SIGN_TEXTS } from '../config/palettes.js';

function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Wrapper around a 2D canvas context with crisp integer drawing primitives. */
export class PixelCanvas {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.canvas = createCanvas(width, height);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.ctx.imageSmoothingEnabled = false;
  }

  fill(color) {
    return this.rect(0, 0, this.width, this.height, color);
  }

  rect(x, y, w, h, color) {
    if (w <= 0 || h <= 0) return this;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    return this;
  }

  /** Single wrapped pixel (keeps procedural strokes seamlessly tileable). */
  px(x, y, color) {
    const W = this.width;
    const H = this.height;
    const xx = ((x % W) + W) % W;
    const yy = ((y % H) + H) % H;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(xx, yy, 1, 1);
    return this;
  }

  /** Random speckles inside a rectangle. */
  speckle(x, y, w, h, colors, density, rng) {
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) {
      this.ctx.fillStyle = colors[(rng.next() * colors.length) | 0];
      this.ctx.fillRect(x + ((rng.next() * w) | 0), y + ((rng.next() * h) | 0), 1, 1);
    }
    return this;
  }

  /**
   * @param {object} [o]
   * @param {boolean} [o.repeat=false]
   * @param {boolean} [o.mipmaps=false]
   * @param {boolean} [o.srgb=true]
   * @param {boolean} [o.linear=false]
   */
  toTexture({ repeat = false, mipmaps = false, srgb = true, linear = false } = {}) {
    const tex = new THREE.CanvasTexture(this.canvas);
    tex.flipY = false;
    tex.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
    tex.minFilter = mipmaps
      ? linear
        ? THREE.LinearMipmapLinearFilter
        : THREE.NearestMipmapNearestFilter
      : tex.magFilter;
    tex.generateMipmaps = mipmaps;
    tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = linear ? 8 : 1;
    tex.needsUpdate = true;
    return tex;
  }
}

// ---------------------------------------------------------------------------
// 3×5 pixel font
// ---------------------------------------------------------------------------

const FONT_3X5 = {
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553',
  H: '55755', I: '72227', J: '11152', K: '55655', L: '44447', M: '57755', N: '65555',
  O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557',
  V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  0: '75557', 1: '26227', 2: '61247', 3: '61216', 4: '55711', 5: '74616', 6: '34757',
  7: '71222', 8: '75757', 9: '75716', '/': '11244', '-': '00700', ' ': '00000', '&': '24253',
};

/** Width in pixels of `text` drawn with the 3×5 font at `scale`. */
export function textWidth(text, scale = 1) {
  return text.length > 0 ? (text.length * 4 - 1) * scale : 0;
}

function drawText(text, x, y, scale, plot) {
  const up = text.toUpperCase();
  for (let c = 0; c < up.length; c++) {
    const glyph = FONT_3X5[up[c]] ?? FONT_3X5[' '];
    for (let row = 0; row < 5; row++) {
      const bits = glyph.charCodeAt(row) - 48;
      for (let col = 0; col < 3; col++) {
        if (bits & (4 >> col)) plot(x + (c * 4 + col) * scale, y + row * scale, scale, scale);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Ground textures: Smooth Weathered Asphalt & Bevelled Stone Sidewalk Slabs
// ---------------------------------------------------------------------------

/**
 * Tileable weathered asphalt (256 px ≙ 4 m): subtle tonal patches, fine aggregate & hairline cracks.
 * @param {number} [seed=7]
 */
export function createAsphaltTexture(seed = 7) {
  const S = 256;
  const pc = new PixelCanvas(S, S);
  const rng = new Rng(seed);

  pc.fill('#66686f');

  // Soft tonal wear patches so asphalt feels smooth and organic, never noisy
  for (let i = 0; i < 18; i++) {
    const w = rng.int(24, 72);
    const h = rng.int(24, 72);
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    const col = rng.pick(['#5f6169', '#6a6c74', '#62646c']);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        if (rng.chance(0.65)) pc.px(x + xx, y + yy, col);
      }
    }
  }

  pc.speckle(0, 0, S, S, ['#5e6068', '#6b6d75', '#61636b'], 0.24, rng);
  pc.speckle(0, 0, S, S, ['#73757e', '#5b5d65'], 0.04, rng);

  // Delicate dark hairline cracks with subtle light rim
  for (let i = 0; i < 5; i++) {
    let x = rng.int(0, S - 1);
    let y = rng.int(0, S - 1);
    let dir = rng.range(0, Math.PI * 2);
    const len = rng.int(35, 110);
    for (let s = 0; s < len; s++) {
      dir += rng.range(-0.45, 0.45);
      x += Math.round(Math.cos(dir));
      y += Math.round(Math.sin(dir));
      pc.px(x + 1, y, '#555760');
      pc.px(x, y, '#32343a');
      if (rng.chance(0.05)) {
        let bx = x;
        let by = y;
        let bd = dir + rng.sign() * 1.1;
        for (let b = 0; b < rng.int(8, 22); b++) {
          bd += rng.range(-0.4, 0.4);
          bx += Math.round(Math.cos(bd));
          by += Math.round(Math.sin(bd));
          pc.px(bx, by, '#383a41');
        }
      }
    }
  }

  return pc.toTexture({ repeat: true, mipmaps: true, linear: true });
}

/**
 * Tileable bevelled large architectural stone/concrete sidewalk flags (256 px ≙ 2 m).
 * 2×2 courses per 2 m = chunky 1.0 m × 1.0 m staggered slabs (3 big slabs across sidewalk),
 * filtered with trilinear + 8x anisotropy so oblique views never shimmer or crawl.
 * @param {number} [seed=11]
 */
export function createCobbleTexture(seed = 11) {
  const S = 256;
  const ROWS = 2;
  const COLS = 2;
  const rowH = S / ROWS;
  const pc = new PixelCanvas(S, S);
  const rng = new Rng(seed);

  const slabTones = ['#a49e93', '#aba499', '#9f998f', '#b0a99d'];

  pc.fill('#56524a'); // deep recessed mortar joint

  for (let r = 0; r < ROWS; r++) {
    const y0 = r * rowH;
    const stagger = (r % 2) * Math.floor(S / (COLS * 2));
    for (let c = 0; c < COLS; c++) {
      const xStart = stagger + Math.floor((c * S) / COLS);
      const xEnd = stagger + Math.floor(((c + 1) * S) / COLS);
      const w = xEnd - xStart;
      const tone = rng.pick(slabTones);

      // Base slab body + crisp chamfered stone bevels
      for (let yy = 3; yy < rowH - 2; yy++) {
        for (let xx = 3; xx < w - 2; xx++) {
          let col = tone;
          if (yy <= 5 || xx <= 5) col = '#bdb6aa';
          else if (yy >= rowH - 5 || xx >= w - 5) col = '#868077';
          pc.px(xStart + xx, y0 + yy, col);
        }
      }

      // Soft natural limestone patches & mineral speckles
      for (let p = 0; p < 8; p++) {
        const pw = rng.int(10, 26);
        const ph = rng.int(10, 26);
        const px0 = xStart + rng.int(8, w - pw - 8);
        const py0 = y0 + rng.int(8, rowH - ph - 8);
        const pCol = rng.pick(['#9d978d', '#aea79b', '#a8a196']);
        for (let yy = 0; yy < ph; yy++) {
          for (let xx = 0; xx < pw; xx++) {
            if (rng.chance(0.45)) pc.px(px0 + xx, py0 + yy, pCol);
          }
        }
      }
      for (let k = 0; k < 95; k++) {
        pc.px(
          xStart + rng.int(6, w - 6),
          y0 + rng.int(6, rowH - 6),
          rng.pick(['#938d83', '#b8b1a5', '#878178']),
        );
      }
    }
  }

  return pc.toTexture({ repeat: true, mipmaps: true, linear: true });
}

// ---------------------------------------------------------------------------
// High-detail 2048² Diorama Facade & Prop Atlas (128 px base cell = 4× texels!)
// ---------------------------------------------------------------------------

export const ATLAS_SIZE = 2048;
export const ATLAS_CELL = 128;

const M_NONE = '#000000';
const M_TINT = '#0000ff';
const M_GLASS = '#ff0000';
const M_NEON = '#00ff00';

class AtlasPainter {
  constructor(size) {
    this.albedo = new PixelCanvas(size, size);
    this.mask = new PixelCanvas(size, size);
    this.albedo.fill('#ffffff');
    this.mask.fill(M_TINT);
  }

  rect(x, y, w, h, color, mask = M_NONE) {
    this.albedo.rect(x, y, w, h, color);
    this.mask.rect(x, y, w, h, mask);
  }

  px(x, y, color, mask = M_NONE) {
    this.rect(x, y, 1, 1, color, mask);
  }

  speckle(x, y, w, h, colors, count, rng, mask = M_TINT) {
    const clusters = Math.max(1, Math.round(count * 0.45));
    for (let i = 0; i < clusters; i++) {
      const col = colors[(rng.next() * colors.length) | 0];
      const xx = x + ((rng.next() * Math.max(1, w - 1)) | 0);
      const yy = y + ((rng.next() * Math.max(1, h - 1)) | 0);
      this.albedo.rect(xx, yy, 2, 2, col);
      if (mask !== null) this.mask.rect(xx, yy, 2, 2, mask);
    }
  }
}

const C = ATLAS_CELL;
const cell = (cx, cy, cw = 1, ch = 1) => ({ x: cx * C, y: cy * C, w: cw * C, h: ch * C });
/** 128×192 window tile in the tall-glazing band starting at atlas row 12. */
const tall = (i) => ({ x: i * C, y: 12 * C, w: C, h: Math.round(C * 1.5) });

export const WALL_STYLES = Object.freeze(['brick', 'plaster', 'siding', 'stone']);

const TILE_LAYOUT = {
  // Row 0: Primary Masonry, Shutters, Road Hardware, Badges & Props
  white: cell(0, 0),
  wall_brick: cell(1, 0),
  wall_plaster: cell(2, 0),
  wall_siding: cell(3, 0),
  wall_stone: cell(4, 0),
  shutter: cell(5, 0),
  manhole: cell(6, 0),
  grate: cell(7, 0),
  barrel: cell(8, 0),
  terracotta: cell(9, 0),
  quoin_stone: cell(14, 0),
  chalkboard: cell(15, 0),

  // Row 1: Shutters, Ironwork, Mouldings & Vehicle Hardware
  shutter_wood: cell(11, 1),
  balcony_iron: cell(12, 1),
  cornice_dentil: cell(13, 1),
  tire_tread: cell(14, 1),
  taxi_grille: cell(15, 1),

  // Row 2: Utility Boxes
  meter_box: cell(4, 2),
  open_plaque: cell(5, 2),

  // Row 4: Roofs, Grounds, Foliage, Timber, Metals & Taxi Trim
  roof_tiles: cell(0, 4),
  roof_gravel: cell(1, 4),
  roof_metal: cell(2, 4),
  awning: cell(3, 4),
  grass: cell(4, 4),
  dirt: cell(5, 4),
  cobble: cell(6, 4),
  leaves: cell(7, 4),
  bark: cell(8, 4),
  glass_panel: cell(9, 4),
  metal: cell(10, 4),
  bulb: cell(11, 4),
  wood: cell(12, 4),
  checker: cell(13, 4),
  hedge: cell(14, 4),
  vent: cell(15, 4),

  // Row 5–6: Backlit Posters (128×256), Taxi Roof Medallion, Licence Plate & Wheel Hubcap
  poster_0: cell(0, 5, 1, 2),
  poster_1: cell(1, 5, 1, 2),
  poster_2: cell(2, 5, 1, 2),
  taxi_sign: cell(3, 5, 2, 1),
  plate: cell(5, 5, 1, 1),
  wheel_cap: cell(6, 5, 1, 1),
  awning_festive: cell(7, 5, 1, 1),

  // Row 6: Ramen storefront set (fascia board, paper lanterns, door plaque)
  ramen_sign: cell(0, 11, 4, 1), // row 6 cells 0–2 hold the lower halves of the posters
  lantern_paper: cell(5, 6),
  lantern_glyph: cell(6, 6),
  plaque_118: cell(7, 6),

  // House-number plaques for the park rowhouses (row 6, free cells after the ramen set)
  plaque_112: cell(9, 6),
  plaque_114: cell(10, 6),
  plaque_116: cell(11, 6),

  // Rows 12–13½: residential sash glazing in tall 128×192 tiles (2:3, the proportion of a real
  // sash window, so the glazing is never stretched). Fabric pixels carry the `M_FABRIC` mask
  // (glass + tint): they take the per-window vertex colour and glow in it when the room is lit.
  win_plain_cream: tall(0),
  win_plain_dark: tall(1),
  win_curtain_cream: tall(2),
  win_curtain_dark: tall(3),
  win_blind_cream: tall(4),
  win_blind_dark: tall(5),
  win_sheer_cream: tall(6),
  win_sheer_dark: tall(7),
  win_six_cream: tall(8),
  win_stair_cream: tall(9),
  win_stair_dark: tall(10),
  shop_glass: { x: 12 * C, y: 12 * C, w: C, h: 150 },
  // Taller than 2:3, from row 10½ (128×256, 1:2): the floor-length parlor sash of a brownstone
  // (2/2, curtains) and the 6/9 sash of a Greek Revival parlor floor (sheer)
  win_parlor: { x: 13 * C, y: 10.5 * C, w: C, h: 2 * C },
  win_six_nine: { x: 14 * C, y: 10.5 * C, w: C, h: 2 * C },
  // Chicago window (256×192, 4:3): a wide fixed pane between two narrow sashes
  win_chicago: { x: 6 * C, y: 10.5 * C, w: 2 * C, h: 1.5 * C },
  // Exhibition banner of the gallery (1:2)
  banner_art: { x: 15 * C, y: 10.5 * C, w: C, h: 2 * C },

  // Row 15: the civic set of chunk 7 – the town flag (3:2) and the attic inscription (8:1)
  flag_town: { x: 0, y: 15 * C, w: 1.5 * C, h: C },
  inscription_town_hall: { x: 2 * C, y: 15 * C, w: 4 * C, h: 0.5 * C },
  // Chunk 8: the post office frieze (8:1), the hotel's canopy end (6:1) and its vertical neon
  // (1:7, column 15 from row 7 down to row 10½)
  inscription_post_office: { x: 6 * C, y: 15 * C, w: 4 * C, h: 0.5 * C },
  canopy_metropole: { x: 2 * C, y: 15.5 * C, w: 3 * C, h: 0.5 * C },
  vsign_hotel: { x: 15 * C, y: 7 * C, w: 0.5 * C, h: 3.5 * C },
  // Chunk 9: the clockmaker's dial (round in its square), the bar's neon cocktail glass, the
  // terracotta number tablet of № 150 (2:1), the brass numerals on № 152's door (2:1) and the
  // bar's vertical neon (1:3, the free half of column 15 beside the hotel's)
  clock_dial: cell(12, 15),
  neon_cocktail: cell(13, 15),
  tablet_150: { x: 11 * C, y: 15.5 * C, w: C, h: 0.5 * C },
  numerals_152: { x: 14 * C, y: 15 * C, w: C, h: 0.5 * C },
  vsign_bar: { x: 15.5 * C, y: 7 * C, w: 0.5 * C, h: 1.5 * C },
  // Chunk 10 (row 2 from column 6, the Queen Anne window down into row 3): the burger bar's
  // script neon (2:1) and its burger blade sign, the porcelain-enamel panels and the chrome trim
  // of its 1950s front, the diagonal boards of the carriage-house gates, leaded stained glass and
  // the Queen Anne living-room window (1:1)
  neon_burgers: cell(6, 2, 2, 1),
  blade_burger: cell(8, 2),
  enamel_panel: cell(9, 2),
  chrome: cell(10, 2),
  boards_diagonal: cell(11, 2),
  glass_stained: cell(12, 2),
  win_qa: cell(14, 2, 2, 2),
  // Chunk 11 (row 15): the pharmacy's neon Rx in its window and the brass numerals on № 166's
  // door (2:1, the free half row under the post office frieze)
  neon_rx: cell(15, 15),
  numerals_166: { x: 5 * C, y: 15.5 * C, w: C, h: 0.5 * C },
  // Chunk 0 (row 5 from column 8): the news kiosk's rack of magazines over folded papers (2:1)
  // and the diamond-cut slate laid in bands on № 100's mansard
  news_rack: cell(8, 5, 2, 1),
  slate_diamond: cell(10, 5),
  // Chunk 1: the bookshop cart's row of spines (tiles along the row)
  book_spines: cell(11, 5),
  // Chunk 2 and the ramen bar: the grey kawara tiles of its pent roof (tinted, the rows of round
  // tiles running down the slope) and its indigo noren (2:1, the curtain over the door)
  kawara: cell(12, 5),
  noren: { x: 13 * C, y: 5 * C, w: C, h: C >> 1 },
  // Street trees: the mottled bark of the London plane (cream, olive and grey plates)
  bark_plane: cell(14, 5),

  // Row 14: wall and roof materials of the redesigned houses
  stone_rockfaced: cell(0, 14),
  brick_flemish: cell(1, 14),
  brick_painted: cell(2, 14),
  slate_fishscale: cell(3, 14),
  slate_rect: cell(4, 14),
  incised_panel: cell(5, 14),
  wood_paint: cell(6, 14),
  // Faded painted advertisement on an exposed party wall (3:1)
  ghost_sign: cell(7, 14, 3, 1),
  // Blade signs hung out over the sidewalk on an iron arm (round: the geometry is a disc)
  blade_record: cell(11, 14),
  blade_bike: cell(12, 14),
  // Barber's pole: red, white and blue spiral stripes that tile seamlessly both ways (the
  // shader scrolls them up the glass tube)
  barber_pole: cell(13, 14),
  blade_teapot: cell(14, 14),
};

/** Building dates cut into cornice friezes and parapet panels (128 × 64, two per cell). */
export const BUILDING_DATES = Object.freeze([1879, 1924, 1872, 1889, 1908]);
/** Their cells: column, row (half rows .5). */
const DATE_CELLS = [
  [10, 14],
  [10, 14.5],
  [10, 15],
  [11, 15],
  [8, 6],
];
BUILDING_DATES.forEach((year, i) => {
  const [cx, cy] = DATE_CELLS[i];
  TILE_LAYOUT[`date_${year}`] = { x: cx * C, y: cy * C, w: C, h: C >> 1 };
});

/** Row 13½: 64 px enamel house-number plaques for every even number 100–166 not yet painted. */
const PLAQUE = C >> 1;
export const HOUSE_NUMBERS = Object.freeze(
  Array.from({ length: 34 }, (_, i) => 100 + i * 2).filter((n) => !TILE_LAYOUT[`plaque_${n}`]),
);
HOUSE_NUMBERS.forEach((n, i) => {
  TILE_LAYOUT[`plaque_${n}`] = { x: i * PLAQUE, y: 13.5 * C, w: PLAQUE, h: PLAQUE };
});

/** Row 7: the small 3:1 shop signs (`SHOP_SIGNS`), ten per half-row. */
const SMALL_SIGN = { w: 192, h: 64 };

// ---------------------------------------------------------------------------
// Detailed 128px Architectural Material Painters
// ---------------------------------------------------------------------------

function paintWall(p, style, x0, y0, w, h, rng) {
  switch (style) {
    case 'brick': {
      // Recessed lime mortar bed + shadow groove
      p.rect(x0, y0, w, h, '#aba093', M_TINT);
      const bh = 11;
      const stretcherW = 26;
      const headerW = 14;
      const brickTones = [
        '#efe6db',
        '#e3d8ca',
        '#f6eee4',
        '#d6c7b6',
        '#cbb9a6',
        '#dfd3c4',
        '#eae0d3',
      ];
      let rowIdx = 0;
      for (let y = 0; y < h; y += bh) {
        const curH = Math.min(bh - 2, h - y);
        if (curH <= 0) break;
        // Dark overhang shadow in mortar joint right under previous course
        if (y > 0) p.rect(x0, y0 + y - 1, w, 1, '#857b6f', M_TINT);

        let x = -((rowIdx % 2) * 13);
        let colIdx = rowIdx;
        while (x < w) {
          // Flemish bond: alternate stretcher (26px) and darker header brick (14px)
          const isHeader = colIdx % 3 === 1;
          const bw = isHeader ? headerW : stretcherW;
          const bx = Math.max(0, x);
          const curW = Math.min(w, x + bw - 2) - bx;
          if (curW > 1) {
            const shade = isHeader
              ? rng.pick(['#d1c1af', '#dccdc0', '#c6b4a1'])
              : rng.pick(brickTones);
            p.rect(x0 + bx, y0 + y, curW, curH, shade, M_TINT);
            // Sunlit top bevel + subtle left edge
            p.rect(x0 + bx, y0 + y, curW, 1, '#fbf6ee', M_TINT);
            if (curH > 3) {
              p.rect(x0 + bx, y0 + y + curH - 1, curW, 1, '#bfb09f', M_TINT);
            }
            // Fired clay pores inside individual bricks
            for (let k = 0; k < 3; k++) {
              p.px(
                x0 + bx + rng.int(1, Math.max(1, curW - 2)),
                y0 + y + rng.int(1, Math.max(1, curH - 2)),
                rng.pick(['#bca996', '#f9f3eb']),
                M_TINT,
              );
            }
          }
          x += bw;
          colIdx++;
        }
        rowIdx++;
      }
      // Subtle lime efflorescence / soot patina patches
      p.speckle(x0, y0, w, h, ['#f5efe7', '#bfb3a4'], Math.round(w * h * 0.025), rng, M_TINT);
      break;
    }

    case 'plaster': {
      p.rect(x0, y0, w, h, '#ebe6dd', M_TINT);
      // Multi-scale organic sponge/trowel stucco clouds
      for (let i = 0; i < 36; i++) {
        const pw = rng.int(14, 42);
        const ph = rng.int(10, 32);
        const px0 = x0 + rng.int(0, Math.max(1, w - pw));
        const py0 = y0 + rng.int(0, Math.max(1, h - ph));
        const c = rng.pick(['#e3ddd3', '#f2ede5', '#ded8ce', '#efeae1']);
        p.rect(px0, py0, pw, ph, c, M_TINT);
      }
      // Damp weathered gradient near base of course
      const dampStart = Math.floor(h * 0.76);
      for (let y = dampStart; y < h; y++) {
        const t = (y - dampStart) / Math.max(1, h - dampStart);
        p.rect(x0, y0 + y, w, 1, t > 0.55 ? '#d4cec3' : '#ded8cd', M_TINT);
      }
      // Subtle vertical rain-wash streaks from upper cornice/sills
      for (let s = 0; s < 7; s++) {
        const sx = x0 + rng.int(6, w - 7);
        const slen = rng.int(18, Math.floor(h * 0.45));
        for (let yy = 0; yy < slen; yy++) {
          if (rng.chance(0.75)) p.px(sx, y0 + yy, '#dad4c9', M_TINT);
        }
      }
      // Delicate hairline plaster craze crack
      let cx = x0 + rng.int(18, w - 18);
      let cy = y0 + rng.int(12, h - 28);
      for (let k = 0; k < 24; k++) {
        cx += rng.int(-1, 1);
        cy += 1;
        if (cx > x0 + 2 && cx < x0 + w - 2 && cy < y0 + h - 2) {
          p.px(cx, cy, '#bfb9ae', M_TINT);
          p.px(cx + 1, cy, '#f5f1ea', M_TINT);
        }
      }
      p.speckle(x0, y0, w, h, ['#dfd9ce', '#f6f2eb', '#d7d0c5'], Math.round(w * h * 0.08), rng, M_TINT);
      break;
    }

    case 'siding': {
      p.rect(x0, y0, w, h, '#eae4da', M_TINT);
      const boardH = 16; // Exact divisor of 128 px (`128 / 16 = 8` boards) eliminates UV wrap seam shimmer
      let bIdx = 0;
      for (let y = 0; y < h; y += boardH) {
        const curH = Math.min(boardH, h - y);
        const boardTone = rng.pick(['#ece6dc', '#e6dfd5', '#f0ebe2']);
        p.rect(x0, y0 + y, w, curH, boardTone, M_TINT);
        // Band-limited graduated lap bevel (avoids harsh 1-px bright-to-dark moiré during motion)
        p.rect(x0, y0 + y, w, 2, '#f5f0e8', M_TINT);
        if (curH >= 4) p.rect(x0, y0 + y + curH - 3, w, 2, '#d8d1c5', M_TINT);
        if (curH >= 2) p.rect(x0, y0 + y + curH - 1, w, 1, '#bfb7aa', M_TINT);

        // Longitudinal wood-grain fibres
        for (let g = 0; g < 4; g++) {
          const gy = y0 + y + rng.int(3, Math.max(3, curH - 4));
          const gx = x0 + rng.int(0, Math.max(1, w - 28));
          p.rect(gx, gy, rng.int(16, 36), 1, rng.pick(['#e1dad0', '#f3eee5']), M_TINT);
        }

        // Staggered vertical plank butt-joint + tiny twin nail heads
        const jx = ((bIdx * 47 + 19) % Math.max(24, w - 16)) + 8;
        if (jx < w - 4 && curH >= 6) {
          p.rect(x0 + jx, y0 + y + 2, 1, curH - 4, '#c4bcb0', M_TINT);
          p.px(x0 + jx - 2, y0 + y + 4, '#aea69a', M_TINT);
          p.px(x0 + jx + 2, y0 + y + 4, '#aea69a', M_TINT);
        }
        bIdx++;
      }
      break;
    }

    case 'stone':
    default: {
      // Deep ashlar mortar grooves
      p.rect(x0, y0, w, h, '#8f887d', M_TINT);
      const bh = 21;
      const bw = 42;
      let rIdx = 0;
      for (let y = 0; y < h; y += bh) {
        const curH = Math.min(bh - 2, h - y);
        if (curH <= 2) break;
        const off = (rIdx % 2) * (bw >> 1);
        for (let x = -off; x < w; x += bw) {
          const bx = Math.max(0, x);
          const curW = Math.min(w, x + bw - 2) - bx;
          if (curW <= 3) continue;
          const stoneBase = rng.pick(['#ece6db', '#e2dbd0', '#f1ece2', '#dcd4c7']);
          p.rect(x0 + bx, y0 + y, curW, curH, stoneBase, M_TINT);
          // Dressed stone 2px bevelled edges (bright top/left, shaded bottom/right)
          p.rect(x0 + bx, y0 + y, curW, 2, '#faf6ee', M_TINT);
          p.rect(x0 + bx, y0 + y, 2, curH, '#f5f0e7', M_TINT);
          p.rect(x0 + bx, y0 + y + curH - 2, curW, 2, '#c4bcb0', M_TINT);
          p.rect(x0 + bx + curW - 2, y0 + y, 2, curH, '#cbc3b6', M_TINT);
          // Bush-hammered stone stipple inside the dressed margin
          if (curW > 10 && curH > 8) {
            p.speckle(
              x0 + bx + 4,
              y0 + y + 4,
              curW - 8,
              curH - 8,
              ['#d4cdc0', '#f7f3eb', '#cac2b4'],
              18,
              rng,
              M_TINT,
            );
          }
        }
        rIdx++;
      }
      break;
    }
  }
}

function paintQuoinStone(p, t, rng) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#847d72', M_TINT);
  const bh = 16;
  for (let yy = 0, idx = 0; yy < h; yy += bh, idx++) {
    const curH = Math.min(bh - 2, h - yy);
    const inset = idx % 2 === 0 ? 2 : 12;
    const bw = w - inset * 2;
    const shade = idx % 2 === 0 ? '#efe9de' : '#e3dcd0';
    p.rect(x + inset, y + yy, bw, curH, shade, M_TINT);
    p.rect(x + inset, y + yy, bw, 2, '#fcf8f0', M_TINT);
    p.rect(x + inset, y + yy + curH - 2, bw, 2, '#beb6a8', M_TINT);
    p.speckle(x + inset + 3, y + yy + 3, bw - 6, Math.max(1, curH - 6), ['#cfc7b9', '#faf6ee'], 16, rng, M_TINT);
  }
}

function paintShutter(p, t, rng) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#d4d4d6', M_TINT);
  // Cylindrical-shaded corrugated steel slats every 8 px (band-limited to prevent roll-up moiré)
  for (let yy = 0; yy < h - 10; yy += 8) {
    p.rect(x, y + yy, w, 2, '#ececef', M_TINT);
    p.rect(x, y + yy + 2, w, 2, '#dadade', M_TINT);
    p.rect(x, y + yy + 4, w, 2, '#bebec4', M_TINT);
    p.rect(x, y + yy + 6, w, 2, '#8d8d94', M_TINT);
  }
  // Vertical side steel guide channels
  p.rect(x, y, 5, h, '#7d8087', M_NONE);
  p.rect(x + w - 5, y, 5, h, '#7d8087', M_NONE);
  p.rect(x + 5, y, 2, h, '#484a50', M_NONE);
  p.rect(x + w - 7, y, 2, h, '#484a50', M_NONE);

  // Heavy galvanized bottom lock rail + central brass padlock & handle plate
  p.rect(x, y + h - 10, w, 10, '#80838a', M_NONE);
  p.rect(x, y + h - 10, w, 2, '#aeb2ba', M_NONE);
  p.rect(x + (w >> 1) - 10, y + h - 14, 20, 10, '#4c4f56', M_NONE);
  p.rect(x + (w >> 1) - 3, y + h - 11, 6, 6, '#d6b054', M_NONE);

  // Subtle band-limited patina smudges along lower slats (`M_TINT` prevents bright untinted 1-px sparkles!)
  for (let i = 0; i < 28; i++) {
    p.rect(
      x + rng.int(8, w - 14),
      y + rng.int(Math.floor(h * 0.55), h - 12),
      4,
      2,
      rng.pick(['#b5aca6', '#a89f99']),
      M_TINT,
    );
  }
}

function paintGlass(p, x, y, w, h, warmInterior = false) {
  const base = warmInterior ? '#4e3f2d' : '#233041';
  const upper = warmInterior ? '#362b1e' : '#182230';
  const lower = warmInterior ? '#665239' : '#2d3e52';
  const glint = warmInterior ? '#a88f6a' : '#6c87a6';

  p.rect(x, y, w, h, base, M_GLASS);
  p.rect(x, y, w, Math.max(3, (h * 0.28) | 0), upper, M_GLASS);
  p.rect(x, y + h - Math.max(3, (h * 0.22) | 0), w, Math.max(3, (h * 0.22) | 0), lower, M_GLASS);

  // Subtle curtain / blind valance silhouette at top of upper-floor windows
  if (!warmInterior && h >= 24) {
    p.rect(x + 2, y + 2, w - 4, 5, '#3b4654', M_GLASS);
  }

  // Crisp double diagonal specular sky reflection ribbons
  const span = Math.min(w, h);
  for (let i = 2; i < span - 2; i++) {
    const gx = x + w - 4 - i;
    const gy = y + 3 + i;
    if (gx > x + 1 && gy < y + h - 1) {
      p.px(gx, gy, glint, M_GLASS);
      if (gx - 1 > x + 1) p.px(gx - 1, gy, glint, M_GLASS);
    }
    const gx2 = gx - 7;
    if (gx2 > x + 1 && gy < y + h - 1 && i % 2 === 0) {
      p.px(gx2, gy, glint, M_GLASS);
    }
  }
}

function paintWoodShutterTile(p, t) {
  const { x, y, w, h } = t;
  // Louvered painted timber window shutter leaf (`M_TINT` so shutter colours work!)
  p.rect(x, y, w, h, '#d8d8d8', M_TINT);
  p.rect(x, y, w, 3, '#f2f2f2', M_TINT);
  p.rect(x, y, 3, h, '#eeeeee', M_TINT);
  p.rect(x + w - 3, y, 3, h, '#9e9e9e', M_TINT);
  p.rect(x, y + h - 3, w, 3, '#949494', M_TINT);

  // Upper & lower recessed louver panels with centre rail
  for (const [py, ph] of [
    [10, (h >> 1) - 16],
    [(h >> 1) + 6, (h >> 1) - 16],
  ]) {
    p.rect(x + 9, y + py, w - 18, ph, '#b4b4b4', M_TINT);
    for (let ly = py + 3; ly < py + ph - 3; ly += 6) {
      p.rect(x + 11, y + ly, w - 22, 2, '#ececec', M_TINT);
      p.rect(x + 11, y + ly + 2, w - 22, 2, '#bdbdbd', M_TINT);
      p.rect(x + 11, y + ly + 4, w - 22, 2, '#787878', M_TINT);
    }
  }
  // Wrought-iron shutter hinge & tie-back dog
  p.rect(x + 2, y + 22, 12, 4, '#24262a', M_NONE);
  p.rect(x + 2, y + h - 26, 12, 4, '#24262a', M_NONE);
}

function paintBalconyIronTile(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#1b1d21');
  // Top moulded handrail & bottom shoe rail
  p.rect(x, y + 4, w, 7, '#343840');
  p.rect(x, y + 4, w, 2, '#545a66');
  p.rect(x, y + h - 10, w, 7, '#2d3038');
  // Vertical wrought-iron balusters + decorative diamond/circle scrollwork
  for (let xx = 8; xx < w - 4; xx += 12) {
    p.rect(x + xx, y + 11, 4, h - 21, '#363a42');
    p.rect(x + xx, y + 11, 1, h - 21, '#505662');
  }
  for (let cx = 20; cx < w - 16; cx += 32) {
    p.rect(x + cx - 6, y + (h >> 1) - 10, 16, 20, '#3c404a');
    p.rect(x + cx - 2, y + (h >> 1) - 6, 8, 12, '#1b1d21');
  }
}

// ---------------------------------------------------------------------------
// Residential sash glazing with interior dressing (park rowhouses, ramen upper floor)
// ---------------------------------------------------------------------------

/** Glass + tint: fabric that takes the per-window vertex colour and glows in it when lit. */
const M_FABRIC = '#ff00ff';

/** Tied-back side drapes under a pleated valance. Greyscale – coloured via vertex tint. */
function paintDrapes(p, x, y, w, h) {
  const tieY = Math.round(h * 0.6);
  for (const side of [0, 1]) {
    for (let yy = 8; yy < h; yy++) {
      const f =
        yy < tieY ? 0.29 - 0.12 * ((yy - 8) / (tieY - 8)) : 0.17 + 0.08 * ((yy - tieY) / (h - tieY));
      const cw = Math.max(4, Math.round(w * f));
      const x0 = side === 0 ? x : x + w - cw;
      p.rect(x0, y + yy, cw, 1, '#cfcfcf', M_FABRIC);
      for (let k = 2; k < cw - 2; k += 5) p.rect(x0 + k, y + yy, 2, 1, '#a9a9a9', M_FABRIC);
      p.rect(side === 0 ? x0 + cw - 1 : x0, y + yy, 1, 1, '#f4f4f4', M_FABRIC);
    }
    const cwT = Math.round(w * 0.17) + 2;
    p.rect(side === 0 ? x : x + w - cwT, y + tieY - 1, cwT, 3, '#808080', M_FABRIC);
  }
  // Pleated valance
  p.rect(x, y, w, 9, '#d8d8d8', M_FABRIC);
  for (let i = 1; i < w; i += 7) p.rect(x + i, y, 2, 9, '#b4b4b4', M_FABRIC);
  p.rect(x, y + 9, w, 2, '#8e8e8e', M_FABRIC);
}

/** Venetian blind lowered over the upper ~55 % of the sash. */
function paintBlind(p, x, y, w, h, drop = 0.56) {
  const bh = Math.round(h * drop);
  for (let yy = 0; yy < bh; yy += 5) {
    p.rect(x, y + yy, w, 4, '#e2e2e2', M_FABRIC);
    p.rect(x, y + yy + 3, w, 1, '#9c9c9c', M_FABRIC);
  }
  p.rect(x, y + bh, w, 3, '#7e7e7e', M_FABRIC);
  for (const fx of [0.27, 0.73]) p.rect(x + Math.round(w * fx), y, 1, bh, '#b8b8b8', M_FABRIC);
}

/** Full-height translucent sheer with soft vertical folds and a narrow parting in the middle. */
function paintSheer(p, x, y, w, h) {
  for (let xx = 0; xx < w; xx++) {
    const k = xx % 9;
    const c = k < 2 ? '#c9c9c9' : k < 5 ? '#e3e3e3' : '#f3f3f3';
    p.rect(x + xx, y + 5, 1, h - 5, c, M_FABRIC);
  }
  p.rect(x + (w >> 1) - 2, y + 5, 4, h - 5, '#b2b2b2', M_FABRIC);
  p.rect(x, y, w, 5, '#a6a6a6', M_FABRIC);
}

/**
 * Reeded (obscure) stairwell glass: vertical flutes with the silhouette of a landing,
 * a handrail and the next flight behind it. Fabric mask, so the hall light glows through
 * in the vertex tint (cool white) rather than as a warm living-room glow.
 */
function paintStairGlass(p, x, y, w, h) {
  for (let xx = 0; xx < w; xx++) {
    const k = xx % 6;
    p.rect(x + xx, y, 1, h, k < 2 ? '#c3c9ce' : k < 4 ? '#dde2e6' : '#eef1f3', M_FABRIC);
  }
  // Landing slab, handrail and stair stringer seen as soft shadows through the reeds
  const ly = y + Math.round(h * 0.78);
  p.rect(x, ly, w, 5, '#8f969c', M_FABRIC);
  for (let i = 0; i < w; i++) {
    const yy = ly - 6 - Math.round(i * 0.55);
    if (yy > y + 4) p.rect(x + i, yy, 1, 3, '#9fa6ac', M_FABRIC);
    const sy = ly + 10 - Math.round(i * 0.55);
    if (sy > y + 4 && sy < y + h - 2) p.rect(x + i, sy, 1, 2, '#a9b0b5', M_FABRIC);
  }
}

/**
 * Double-hung sash window filling the whole tile (the 3D builder adds the reveal, sill and
 * lintel). `frame` picks painted cream or dark-stained joinery; `dressing` adds curtains,
 * a lowered blind or a sheer behind the glazing bars; `six` gives 6-over-6 lights. `meet` (share
 * of the glass from the top) moves the meeting rail and `cols` sets the vertical bars – a 6/9
 * sash meets at 0.4 with three columns.
 */
function paintSashTile(
  p,
  t,
  { frame = 'cream', dressing = 'none', six = false, meet = 0.5, cols: colsOpt } = {},
) {
  const { x, y, w, h } = t;
  const F = frame === 'dark' ? '#3a2e27' : '#ece5d8';
  const Fs = frame === 'dark' ? '#1f1915' : '#a9a194';
  const bw = 7;
  const gx = x + bw;
  const gy = y + bw;
  const gw = w - bw * 2;
  const gh = h - bw * 2;

  p.rect(x, y, w, h, F);
  p.rect(x, y + h - 2, w, 2, Fs);
  paintGlass(p, gx, gy, gw, gh, false);

  if (dressing === 'curtain') paintDrapes(p, gx, gy, gw, gh);
  else if (dressing === 'blind') paintBlind(p, gx, gy, gw, gh);
  else if (dressing === 'sheer') paintSheer(p, gx, gy, gw, gh);
  else if (dressing === 'stair') paintStairGlass(p, gx, gy, gw, gh);

  // Glazing bars are drawn last: the dressing hangs inside, behind the glass.
  const meetY = gy + Math.round(gh * meet) - 3;
  p.rect(gx, meetY, gw, 6, F);
  p.rect(gx, meetY + 6, gw, 1, Fs);
  const cols = colsOpt ?? (dressing === 'stair' ? 1 : six ? 3 : 2);
  for (let i = 1; i < cols; i++) p.rect(gx + Math.round((gw * i) / cols) - 1, gy, 3, gh, F);
  if (six) {
    p.rect(gx, gy + Math.round(gh * 0.25) - 1, gw, 2, F);
    p.rect(gx, gy + Math.round(gh * 0.75) - 1, gw, 2, F);
  }
  p.rect(gx, gy, gw, 2, Fs);
}

/**
 * Plain shop glazing (bakery): a single light blue-grey pane with diagonal sky reflections
 * and nothing painted behind it – no interior, shelves or goods.
 */
function paintShopGlass(p, t) {
  const { x, y, w, h } = t;
  // Partial glass mask: semi-gloss, so low sun leaves a soft sheen instead of a blown-out pane
  const M_PANE = '#a00000';
  for (let yy = 0; yy < h; yy++) {
    const k = yy / h;
    const c = k < 0.15 ? '#71828f' : k < 0.75 ? '#7b8c98' : '#8696a1';
    p.rect(x, y + yy, w, 1, c, M_PANE);
  }
  // Broad diagonal sky reflections across the pane
  for (const [off, bw, col] of [
    [18, 14, '#a7b9c6'],
    [46, 5, '#c3d2dc'],
    [92, 10, '#a0b2bf'],
  ]) {
    for (let yy = 0; yy < h; yy++) {
      const x0 = off + Math.round((h - yy) * 0.55) - 40;
      for (let xx = x0; xx < x0 + bw; xx++) {
        if (xx >= 0 && xx < w) p.px(x + xx, y + yy, col, M_PANE);
      }
    }
  }
}

/** 7×7 katakana glyphs for the ramen fascia (ラ ー メ ン). */
const KATAKANA_7X7 = {
  ra: ['0111110', '0000000', '1111111', '0000001', '0000010', '0001100', '0110000'],
  dash: ['0000000', '0000000', '0000000', '1111111', '0000000', '0000000', '0000000'],
  me: ['0000010', '0000010', '0100100', '0011000', '0001000', '0010100', '1100000'],
  n: ['0100000', '0010001', '0000001', '0000010', '0000100', '0011000', '1100000'],
};

function drawGlyph7(rows, x, y, scale, plot) {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) if (rows[r][c] === '1') plot(x + c * scale, y + r * scale, scale, scale);
  }
}

/**
 * Ramen fascia board (512×128): maroon field in a cream fillet, big "RAMEN", the
 * katakana "ラーメン" underneath and a noodle bowl with chopsticks and steam.
 */
function paintRamenSign(p, t) {
  const { x, y, w, h } = t;
  const cream = '#f6e6c4';
  p.rect(x, y, w, h, '#24170f');
  p.rect(x + 5, y + 5, w - 10, h - 10, '#e3cfa3', '#004c00');
  p.rect(x + 10, y + 10, w - 20, h - 20, '#6d1d19', '#002c00');
  p.rect(x + 10, y + 10, w - 20, 3, '#8a2a24', '#003400');

  // "RAMEN" with a soft dark drop shadow
  const s = 9;
  const tx = x + 34;
  const ty = y + 16;
  drawText('RAMEN', tx + 3, ty + 3, s, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#2c0b09'));
  drawText('RAMEN', tx, ty, s, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, cream, M_NEON));

  // ラーメン centred under the latin word
  const ks = 4;
  const kGlyphs = ['ra', 'dash', 'me', 'n'];
  const kw = kGlyphs.length * 8 * ks - ks;
  const kx = tx + ((textWidth('RAMEN', s) - kw) >> 1);
  const ky = y + 76;
  kGlyphs.forEach((g, i) => {
    drawGlyph7(KATAKANA_7X7[g], kx + i * 8 * ks, ky, ks, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, cream, M_NEON),
    );
  });

  // Noodle bowl: outlined half disc, rim, noodles, chopsticks and steam
  const cx = x + 392;
  const cy = y + 66;
  const r = 44;
  for (let yy = 0; yy <= r; yy++) {
    for (let xx = -r; xx <= r; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= r && d > r - 6) p.rect(cx + xx, cy + yy, 1, 1, cream, M_NEON);
    }
  }
  p.rect(cx - r - 4, cy - 2, r * 2 + 9, 5, cream, M_NEON);
  p.rect(cx - 14, cy + r - 2, 29, 6, cream, M_NEON);
  for (let i = 0; i < 4; i++) {
    for (let xx = -r + 12; xx <= r - 12; xx++) {
      const yy = cy - 6 - i * 5 + Math.round(Math.sin(xx * 0.32 + i) * 2);
      p.rect(cx + xx, yy, 1, 2, i % 2 === 0 ? cream : '#e4c48c', M_NEON);
    }
  }
  for (const off of [0, 9]) {
    for (let k = 0; k < 64; k++) {
      p.rect(cx + 6 + off + k, cy - 14 - Math.round(k * 0.78), 4, 4, cream, M_NEON);
    }
  }
  for (const sx of [-26, -12]) {
    for (let k = 0; k < 26; k++) {
      p.rect(cx + sx + Math.round(Math.sin(k * 0.45) * 3), cy - 32 - k, 2, 1, '#d9c3a0', '#008000');
    }
  }
}

/** Red washi paper for chōchin lanterns (bamboo ribs) + a glyph panel for the front face. */
function paintLanternPaper(p, paper, glyph) {
  p.rect(paper.x, paper.y, C, C, '#e2532e', '#00b400');
  for (let yy = 4; yy < C; yy += 11) {
    p.rect(paper.x, paper.y + yy, C, 2, '#a7301b', '#006000');
  }
  p.rect(glyph.x, glyph.y, C, C, '#e2532e', '#00b400');
  const ink = '#1c1210';
  // Two stacked brush characters (stylised 拉 / 麺)
  const strokes = [
    [34, 14, 60, 8],
    [58, 8, 10, 46],
    [30, 30, 66, 7],
    [40, 44, 10, 16],
    [76, 42, 10, 18],
    [36, 62, 54, 7],
    [28, 76, 72, 8],
    [42, 86, 10, 28],
    [58, 86, 10, 30],
    [74, 86, 10, 28],
    [38, 106, 52, 7],
  ];
  for (const [sx, sy, sw, sh] of strokes) p.rect(glyph.x + sx, glyph.y + sy, sw, sh, ink);
}

/** Small enamel door-number plaque. */
function paintDoorPlaque(p, t, text = '118') {
  const { x, y } = t;
  const S = t.w; // 128 px plaques (№ 112–118) or 64 px (the rest of the street)
  const k = S / C;
  const b1 = 6 * k;
  const b2 = 12 * k;
  p.rect(x, y, S, S, '#1f1914');
  p.rect(x + b1, y + b1, S - 2 * b1, S - 2 * b1, '#d8c49a', '#004000');
  p.rect(x + b2, y + b2, S - 2 * b2, S - 2 * b2, '#2b221b', '#002000');
  const s = 8 * k;
  const tw = textWidth(text, s);
  drawText(text, x + ((S - tw) >> 1), y + ((S - 5 * s) >> 1), s, (xx, yy, ww, hh) =>
    p.rect(xx, yy, ww, hh, '#f3e3c2', M_NEON),
  );
}

function paintCorniceDentil(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#e8e1d4', M_TINT);
  p.rect(x, y, w, 14, '#faf6ee', M_TINT);
  p.rect(x, y + 14, w, 8, '#cfc7b8', M_TINT);
  // Rhythmic carved dentil blocks & deep shadow pockets
  p.rect(x, y + 26, w, 34, '#8d8578', M_TINT);
  for (let dx = 4; dx < w - 4; dx += 16) {
    p.rect(x + dx, y + 26, 10, 30, '#ede6da', M_TINT);
    p.rect(x + dx, y + 26, 10, 3, '#fbf7ef', M_TINT);
    p.rect(x + dx + 8, y + 28, 2, 28, '#bfb7a8', M_TINT);
  }
  p.rect(x, y + 64, w, 12, '#dcd4c6', M_TINT);
  p.rect(x, y + 76, w, h - 76, '#b8b0a2', M_TINT);
}

// ---------------------------------------------------------------------------
// Distinct Semantic Door Painters (Open Shop vs Heritage House vs Closed Staff)
// ---------------------------------------------------------------------------

function paintMisc(p, tiles, rng) {
  p.rect(tiles.white.x, tiles.white.y, C, C, '#ffffff', M_TINT);

  // 1. Scalloped & bevelled slate/clay roof shingles
  {
    const t = tiles.roof_tiles;
    p.rect(t.x, t.y, C, C, '#cbc4ba', M_TINT);
    const shH = 16;
    const shW = 22;
    for (let y = 0, row = 0; y < C; y += shH, row++) {
      const off = (row % 2) * (shW >> 1);
      for (let x = -off; x < C; x += shW) {
        const bx = Math.max(0, x);
        const curW = Math.min(C, x + shW - 1) - bx;
        if (curW <= 1) continue;
        const slate = rng.pick(['#dfd9cf', '#d1cac0', '#e7e1d8', '#c5beb4']);
        p.rect(t.x + bx, t.y + y, curW, shH - 2, slate, M_TINT);
        p.rect(t.x + bx, t.y + y, curW, 1, '#f5f0e8', M_TINT);
        p.rect(t.x + bx, t.y + y + shH - 3, curW, 2, '#9e978e', M_TINT);
        p.rect(t.x + bx, t.y + y + shH - 1, curW, 1, '#78726a', M_TINT);
      }
    }
    p.speckle(t.x, t.y, C, C, ['#b2aba0', '#f0ebe2'], 220, rng, M_TINT);
  }

  // 2. Tar-and-gravel flat roof membrane
  {
    const t = tiles.roof_gravel;
    p.rect(t.x, t.y, C, C, '#c4c0ba', M_TINT);
    for (let y = 0; y < C; y += 32) {
      p.rect(t.x, t.y + y, C, 2, '#aba7a0', M_TINT);
    }
    p.speckle(t.x, t.y, C, C, ['#a8a49e', '#dcd8d2', '#b6b2ac', '#eae6e0'], 2200, rng, M_TINT);
  }

  // 3. Standing-seam zinc/copper architectural metal roof
  {
    const t = tiles.roof_metal;
    p.rect(t.x, t.y, C, C, '#d6dade', M_TINT);
    for (let x = 0; x < C; x += 16) {
      p.rect(t.x + x + 3, t.y, 10, C, '#dfe3e7', M_TINT);
      p.rect(t.x + x, t.y, 2, C, '#f7f9fb', M_TINT);
      p.rect(t.x + x + 2, t.y, 2, C, '#8f949c', M_TINT);
    }
    // Subtle cross-lock seam
    p.rect(t.x, t.y + 63, C, 2, '#a8adb5', M_TINT);
    p.rect(t.x, t.y + 65, C, 1, '#eef1f5', M_TINT);
  }

  // 4. Woven canvas café awning stripes (tinted stripe + warm ivory stripe + stitched weave)
  {
    const t = tiles.awning;
    const half = C >> 1;
    p.rect(t.x, t.y, half, C, '#ece7de', M_TINT);
    p.rect(t.x + half, t.y, half, C, '#f6efe2', M_NONE);
    p.rect(t.x + half - 3, t.y, 3, C, '#cfc8bc', M_TINT);
    p.rect(t.x + C - 3, t.y, 3, C, '#ddd5c8', M_NONE);
    // Subtle horizontal canvas weave lines
    for (let yy = 0; yy < C; yy += 4) {
      p.rect(t.x, t.y + yy, half - 3, 1, '#e2dcd2', M_TINT);
      p.rect(t.x + half, t.y + yy, half - 3, 1, '#ede5d7', M_NONE);
    }
  }

  // 4b. Festive corner-shop awning: fixed saffron & burnt-orange stripes with
  //     painted canvas weave, used by the orange rowhouse by the park.
  {
    const t = tiles.awning_festive;
    const half = C >> 1;
    p.rect(t.x, t.y, half, C, '#f2a900');
    p.rect(t.x + half, t.y, half, C, '#c8461a');
    p.rect(t.x + half - 3, t.y, 3, C, '#8f3216');
    p.rect(t.x + C - 3, t.y, 3, C, '#7a2c13');
    for (let yy = 0; yy < C; yy += 4) {
      p.rect(t.x, t.y + yy, half - 3, 1, '#ffc21f');
      p.rect(t.x + half, t.y + yy, half - 3, 1, '#d9551f');
    }
  }

  // 5. Cast-iron round waffle manhole cover (128px): a light steel frame and a lid whose raised
  //    rings, spokes and waffle stand out bright on the dark iron – never a dark oval with a
  //    rim, which reads as a puddle
  {
    const t = tiles.manhole;
    p.rect(t.x, t.y, C, C, '#484a51');
    const cx = C / 2 - 0.5;
    const cy = C / 2 - 0.5;
    for (let yy = 0; yy < C; yy++) {
      for (let xx = 0; xx < C; xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (d > 58) continue;
        if (d > 51) {
          p.px(t.x + xx, t.y + yy, d > 55 ? '#3a3b3f' : '#9a9690');
        } else if (d > 47) {
          p.px(t.x + xx, t.y + yy, '#1c1c1e');
        } else {
          const ring = Math.abs(d - 32) < 2.2 || Math.abs(d - 18) < 2.0;
          const spoke = Math.abs(xx - cx) < 2.0 || Math.abs(yy - cy) < 2.0 || Math.abs(Math.abs(xx - cx) - Math.abs(yy - cy)) < 1.8;
          const waffle = (xx + yy) % 8 === 0 || Math.abs(xx - yy) % 8 === 0;
          const boss = d < 10;
          p.px(
            t.x + xx,
            t.y + yy,
            boss ? '#a7a39c' : ring || spoke ? '#99958e' : waffle ? '#77736d' : '#3e3c3a',
          );
        }
      }
    }
  }

  // 6. Slotted cast-iron storm-drain gutter grate
  {
    const t = tiles.grate;
    p.rect(t.x, t.y, C, C, '#383635');
    p.rect(t.x + 6, t.y + 6, C - 12, C - 12, '#524c47');
    p.rect(t.x + 6, t.y + 6, C - 12, 3, '#69625c');
    for (let y = 14; y < C - 14; y += 13) {
      p.rect(t.x + 14, t.y + y, C - 28, 8, '#151517');
      p.rect(t.x + (C >> 1) - 6, t.y + y, 12, 8, '#524c47');
    }
  }

  // 7. Ribbed industrial steel barrel / drum
  {
    const t = tiles.barrel;
    p.rect(t.x, t.y, C, C, '#d8d8d8', M_TINT);
    for (const hy of [34, 62, 88]) {
      p.rect(t.x, t.y + hy, C, 6, '#dedad2', M_NONE);
      p.rect(t.x, t.y + hy, C, 2, '#f5f2eb', M_NONE);
      p.rect(t.x, t.y + hy + 6, C, 3, '#585450', M_NONE);
    }
    p.rect(t.x, t.y, C, 5, '#cbc7bf', M_NONE);
  }

  // 8. Wheel-thrown terracotta clay pot
  {
    const t = tiles.terracotta;
    p.rect(t.x, t.y, C, C, '#b86846');
    p.rect(t.x, t.y, C, 16, '#cc7954');
    p.rect(t.x, t.y, C, 3, '#de8d68');
    p.rect(t.x, t.y + 16, C, 4, '#87482e');
    for (let yy = 36; yy < C; yy += 22) {
      p.rect(t.x, t.y + yy, C, 2, '#c67350');
      p.rect(t.x, t.y + yy + 2, C, 2, '#9e5739');
    }
    p.speckle(t.x, t.y, C, C, ['#a4593a', '#ce7d59'], 350, rng, M_NONE);
  }

  // 10. Wooden-framed chalkboard A-frame menu board
  {
    const t = tiles.chalkboard;
    p.rect(t.x, t.y, C, C, '#7d5636'); // warm walnut frame
    p.rect(t.x + 2, t.y + 2, C - 4, C - 4, '#946843');
    p.rect(t.x + 12, t.y + 12, C - 24, C - 24, '#242928'); // matte slate chalkboard
    drawText('MENU', t.x + 28, t.y + 22, 4, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, '#f5efe2'),
    );
    p.rect(t.x + 22, t.y + 48, C - 44, 2, '#d8cfb8');
    for (let ly = 58; ly <= 98; ly += 13) {
      p.rect(t.x + 22, t.y + ly, 52, 3, '#e8e2d4');
      p.rect(t.x + 84, t.y + ly, 18, 3, '#ebd082');
    }
  }

  // 11. Utility Electric / Gas Meter Box & Standalone "OPEN" Plaque
  {
    const t = tiles.meter_box;
    p.rect(t.x, t.y, C, C, '#70757d');
    p.rect(t.x + 6, t.y + 6, C - 12, C - 12, '#8b919a');
    p.rect(t.x + 6, t.y + 6, C - 12, 3, '#b2b8c2');
    paintGlass(p, t.x + 24, t.y + 22, C - 48, 38, false);
    p.rect(t.x + 34, t.y + 34, C - 68, 14, '#e6e2d8');
    p.rect(t.x + 38, t.y + 39, 36, 4, '#24262a');
    p.rect(t.x + 28, t.y + 76, 36, 16, '#d4a638');
    p.rect(t.x + C - 24, t.y + 60, 8, 20, '#363940');
  }
  {
    const t = tiles.open_plaque;
    p.rect(t.x, t.y, C, C, '#1e2024');
    p.rect(t.x + 8, t.y + 24, C - 16, C - 48, '#2b2f36');
    drawText('OPEN', t.x + 20, t.y + 50, 6, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, '#fff2d6', M_NEON),
    );
  }

  // 12. Grass, dirt, herringbone alley cobble, leaves, bark, glass_panel, metal, bulb, wood, checker, hedge, vent
  {
    const t = tiles.grass;
    p.rect(t.x, t.y, C, C, '#5e8244');
    p.speckle(t.x, t.y, C, C, ['#517339', '#6c9350', '#486832', '#7ba35c'], 2400, rng, M_NONE);
    p.speckle(t.x, t.y, C, C, ['#e8e2be', '#d8b454'], 45, rng, M_NONE);
  }
  {
    const t = tiles.dirt;
    p.rect(t.x, t.y, C, C, '#594433');
    p.speckle(t.x, t.y, C, C, ['#4a3728', '#6b533f', '#78604b', '#3d2d20'], 1800, rng, M_NONE);
  }
  {
    // Clinker & porphyry alley paving stones with crisp mortar joints & warm mineral variation
    const t = tiles.cobble;
    p.rect(t.x, t.y, C, C, '#4c4842');
    const ph = 14;
    const pw = 28;
    for (let y = 0, r = 0; y < C; y += ph, r++) {
      const off = (r % 2) * (pw >> 1);
      for (let x = -off; x < C; x += pw) {
        const bx = Math.max(0, x);
        const curW = Math.min(C, x + pw - 2) - bx;
        if (curW <= 2) continue;
        const stone = rng.pick(['#8f867b', '#9c9286', '#82796f', '#968377', '#a3998d']);
        p.rect(t.x + bx, t.y + y, curW, ph - 2, stone);
        p.rect(t.x + bx, t.y + y, curW, 1, '#b5aba0');
        p.rect(t.x + bx, t.y + y + ph - 3, curW, 1, '#6b645c');
      }
    }
  }
  {
    // Smooth botanical leaf blade shading (tinted per-leaf in 3D from deep forest olive to sunlit sage)
    const t = tiles.leaves;
    const midX = C >> 1;
    for (let yy = 0; yy < C; yy++) {
      const tipGain = 1 - (yy / C) * 0.14;
      for (let xx = 0; xx < C; xx++) {
        const dx = Math.abs(xx - midX) / midX;
        let lum = Math.round((242 - dx * 28) * tipGain);
        if (Math.abs(xx - midX) <= 1) {
          lum = Math.min(255, lum + 14); // soft central midrib highlight
        } else if ((yy + Math.abs(xx - midX)) % 18 < 2 && dx < 0.82) {
          lum = Math.min(255, lum + 7); // subtle lateral botanical veins
        }
        const hex = lum.toString(16).padStart(2, '0');
        p.px(t.x + xx, t.y + yy, `#${hex}${hex}${hex}`, M_TINT);
      }
    }
  }
  {
    const t = tiles.bark;
    p.rect(t.x, t.y, C, C, '#4d392b');
    for (let x = 0; x < C; x += 6) {
      p.rect(t.x + x, t.y, 2, C, rng.pick(['#3b2a1f', '#5c4534', '#443124']));
      p.rect(t.x + x + 2, t.y, 1, C, '#69503d');
    }
    p.speckle(t.x, t.y, C, C, ['#6e785c', '#36261b'], 220, rng, M_NONE);
  }
  {
    const t = tiles.glass_panel;
    p.rect(t.x, t.y, C, C, '#7f9fae');
    p.rect(t.x, t.y, C, 4, '#5a7482');
    p.rect(t.x, t.y + C - 4, C, 4, '#5a7482');
    for (let i = 0; i < C; i++) {
      const x1 = (C - 1 - i + C) % C;
      p.px(t.x + x1, t.y + i, '#d4eaf2');
      if (x1 > 1) p.px(t.x + x1 - 1, t.y + i, '#d4eaf2');
      if (x1 > 14 && i % 2 === 0) p.px(t.x + x1 - 14, t.y + i, '#b8d8e4');
    }
  }
  {
    // Plain painted metal, only a faint speckle: bright seams every 32 px became hairlines on
    // thin rails, posts and bollards that shimmered as the camera moved
    const t = tiles.metal;
    p.rect(t.x, t.y, C, C, '#cfd4da', M_TINT);
    p.speckle(t.x, t.y, C, C, ['#c9ced4', '#d4d9df'], 300, rng, M_TINT);
  }
  {
    const t = tiles.bulb;
    p.rect(t.x, t.y, C, C, '#ffc967', M_NEON);
    p.rect(t.x + 14, t.y + 14, C - 28, C - 28, '#ffdf9b', M_NEON);
    p.rect(t.x + 28, t.y + 28, C - 56, C - 56, '#fff0c4', M_NEON);
  }
  {
    // Planed oak/walnut timber planks with grain fibres & joints
    const t = tiles.wood;
    p.rect(t.x, t.y, C, C, '#9c7147');
    for (let y = 0; y < C; y += 16) {
      const tone = rng.pick(['#9e7349', '#946a41', '#a67a4f']);
      p.rect(t.x, t.y + y, C, 14, tone);
      p.rect(t.x, t.y + y, C, 1, '#b5895d');
      p.rect(t.x, t.y + y + 14, C, 2, '#6e4c2c');
      for (let g = 0; g < 6; g++) {
        p.rect(
          t.x + rng.int(0, C - 32),
          t.y + y + rng.int(2, 12),
          rng.int(16, 36),
          1,
          rng.pick(['#875f39', '#ad8156']),
        );
      }
    }
  }
  {
    // Crisp NYC taxi checkerboard stripe with pre-filtered 1px transition border & dark framing pinstripes
    const t = tiles.checker;
    const sq = 32;
    for (let y = 0; y < C; y += sq) {
      for (let x = 0; x < C; x += sq) {
        const isLight = ((x + y) / sq) % 2 !== 0;
        p.rect(t.x + x, t.y + y, sq, sq, isLight ? '#f5efe2' : '#1b1d22');
        p.rect(t.x + x, t.y + y, sq, 1, '#7e7d78');
        p.rect(t.x + x, t.y + y, 1, sq, '#7e7d78');
      }
    }
    p.rect(t.x, t.y, C, 5, '#1b1d22');
    p.rect(t.x, t.y + C - 5, C, 5, '#1b1d22');
  }
  {
    const t = tiles.hedge;
    p.rect(t.x, t.y, C, C, '#446938');
    for (let i = 0; i < 700; i++) {
      p.rect(
        t.x + rng.int(0, C - 5),
        t.y + rng.int(0, C - 5),
        4,
        4,
        rng.pick(['#38592d', '#547d46', '#2f4d25', '#628c52']),
      );
    }
  }
  {
    // HVAC / AC condenser unit with circular fan shroud & louver grille
    const t = tiles.vent;
    p.rect(t.x, t.y, C, C, '#bcc0c4');
    p.rect(t.x + 6, t.y + 6, C - 12, C - 12, '#a2a7ac');
    const cx = 44;
    const cy = 64;
    for (let yy = 22; yy <= 106; yy++) {
      for (let xx = 12; xx <= 76; xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (d < 30) {
          const grid = yy % 5 === 0 || xx % 5 === 0;
          p.px(t.x + xx, t.y + yy, d < 8 ? '#383c42' : grid ? '#686d73' : '#26292e');
        }
      }
    }
    for (let yy = 20; yy < C - 20; yy += 8) {
      p.rect(t.x + 84, t.y + yy, 30, 4, '#54585e');
    }
  }

  // 13. Vulcanized rubber tire tread + Chrome radiator grille + Wheel hubcap
  {
    const t = tiles.tire_tread;
    p.rect(t.x, t.y, C, C, '#1a1c20');
    // Circumferential drainage channels
    for (const gx of [28, 52, 76, 100]) {
      p.rect(t.x + gx, t.y, 4, C, '#0e1013');
    }
    //橫 sipes & shoulder tread blocks
    for (let y = 0; y < C; y += 12) {
      p.rect(t.x + 4, t.y + y, 22, 7, '#25282e');
      p.rect(t.x + 34, t.y + ((y + 6) % C), 16, 7, '#23262c');
      p.rect(t.x + 58, t.y + y, 16, 7, '#23262c');
      p.rect(t.x + 82, t.y + ((y + 6) % C), 16, 7, '#23262c');
      p.rect(t.x + 104, t.y + y, 20, 7, '#25282e');
    }
  }
  {
    const t = tiles.taxi_grille;
    p.rect(t.x, t.y, C, C, '#14161a');
    p.rect(t.x + 4, t.y + 4, C - 8, C - 8, '#b8c0c8');
    p.rect(t.x + 10, t.y + 10, C - 20, C - 20, '#181b20');
    // Egg-crate chrome vertical & horizontal slats
    for (let xx = 16; xx < C - 14; xx += 10) {
      p.rect(t.x + xx, t.y + 10, 3, C - 20, '#cfd6de');
    }
    for (let yy = 22; yy < C - 16; yy += 18) {
      p.rect(t.x + 10, t.y + yy, C - 20, 4, '#dfe5ec');
    }
    // Classic central gold/red medallion badge
    p.rect(t.x + (C >> 1) - 8, t.y + (C >> 1) - 10, 16, 20, '#dce2e8');
    p.rect(t.x + (C >> 1) - 5, t.y + (C >> 1) - 7, 10, 14, '#b8382c');
  }
  {
    const t = tiles.wheel_cap;
    p.rect(t.x, t.y, C, C, '#1a1c20');
    const cx = C / 2 - 0.5;
    const cy = C / 2 - 0.5;
    for (let yy = 0; yy < C; yy++) {
      for (let xx = 0; xx < C; xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (d > 58) p.px(t.x + xx, t.y + yy, '#1a1c20');
        else if (d > 48) p.px(t.x + xx, t.y + yy, '#262930'); // tire bead
        else if (d > 42) p.px(t.x + xx, t.y + yy, '#cfd5dc'); // outer chrome trim ring
        else if (d > 26) p.px(t.x + xx, t.y + yy, '#2b2e35'); // dark steel wheel dish
        else if (d > 22) p.px(t.x + xx, t.y + yy, '#9aa2ac'); // hubcap bevel
        else if (d > 8) p.px(t.x + xx, t.y + yy, '#e2e7ee'); // domed chrome dog-dish cap
        else p.px(t.x + xx, t.y + yy, '#c89b2c'); // gold centre medallion
      }
    }
  }

  // 14. Backlit vintage transit posters (128 × 256)
  const posterPalettes = [
    ['#344d69', '#e2b866', '#f7efe2'],
    ['#7d3834', '#2c3442', '#e8be74'],
    ['#385c54', '#2b2928', '#df8862'],
  ];
  for (let i = 0; i < 3; i++) {
    const t = tiles[`poster_${i}`];
    const [bg, a, b] = posterPalettes[i];
    p.rect(t.x, t.y, t.w, t.h, '#222428');
    p.rect(t.x + 8, t.y + 8, t.w - 16, t.h - 16, bg, '#007700');
    p.rect(t.x + 14, t.y + 14, t.w - 28, t.h - 28, '#f5ecd8', '#008800');
    p.rect(t.x + 18, t.y + 18, t.w - 36, t.h - 36, bg, '#007700');
    p.rect(t.x + 24, t.y + 36, t.w - 48, 86, a, '#009900');
    p.rect(t.x + 36, t.y + 52, t.w - 72, 54, b, '#00aa00');
    drawText(['JAZZ', 'ART', 'CAFE'][i], t.x + 20, t.y + 164, 6, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, b, M_NEON),
    );
  }

  // 15. Moulded "TAXI" roof medallion sign (256 × 128)
  {
    const t = tiles.taxi_sign;
    p.rect(t.x, t.y, t.w, t.h, '#26292e', M_NONE);
    p.rect(t.x + 6, t.y + 6, t.w - 12, t.h - 12, '#ffe694', M_NEON);
    p.rect(t.x + 12, t.y + 12, t.w - 24, t.h - 24, '#fff2be', M_NEON);
    const s = 13;
    const tw = textWidth('TAXI', s);
    drawText('TAXI', t.x + ((t.w - tw) >> 1), t.y + ((t.h - 5 * s) >> 1), s, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, '#181a1e', M_NONE),
    );
  }

  // 16. Embossed vintage licence plate ("CAB-7")
  {
    const t = tiles.plate;
    p.rect(t.x, t.y, C, C, '#22252a');
    p.rect(t.x + 4, t.y + 12, C - 8, C - 24, '#f2ecde');
    p.rect(t.x + 8, t.y + 16, C - 16, 14, '#2b4775');
    const s = 5;
    const tw = textWidth('CAB-7', s);
    drawText('CAB-7', t.x + ((C - tw) >> 1), t.y + 48, s, (xx, yy, ww, hh) =>
      p.rect(xx, yy, ww, hh, '#1d222b'),
    );
  }
}

/**
 * Heritage framed fascia board: iron frame, brass fillet, inner rule, drop-shadowed letters.
 * Scales with the board height (`k = h / 128`); `k = 1` is the original 384 × 128 board.
 */
function paintSignboard(p, r, text, fgHex, bgHex) {
  const { x: sx, y: sy, w, h } = r;
  const k = h / C;
  const n = (v) => Math.round(v * k);
  p.rect(sx, sy, w, h, '#202227'); // wrought-iron outer frame
  p.rect(sx + n(6), sy + n(6), w - n(12), h - n(12), '#c8b694', '#003800'); // brass/ivory fillet
  p.rect(sx + n(10), sy + n(10), w - n(20), h - n(20), bgHex, '#005000');
  p.rect(sx + n(15), sy + n(15), w - n(30), h - n(30), '#e8dcc4', '#004800');
  p.rect(sx + n(17), sy + n(17), w - n(34), h - n(34), bgHex, '#005800');

  // Corner brass rivets
  for (const [rx, ry] of [
    [n(22), n(22)],
    [w - n(26), n(22)],
    [n(22), h - n(26)],
    [w - n(26), h - n(26)],
  ]) {
    p.rect(sx + rx, sy + ry, n(4), n(4), '#dec484', '#004800');
  }

  const scale =
    textWidth(text, n(12)) <= w - n(56)
      ? n(12)
      : textWidth(text, n(10)) <= w - n(52)
        ? n(10)
        : n(8);
  const tw = textWidth(text, scale);
  const tx0 = sx + ((w - tw) >> 1);
  const ty0 = sy + ((h - 5 * scale) >> 1);

  // Subtle dark drop-shadow behind sign letters + crisp backlit lettering
  drawText(text, tx0 + n(3), ty0 + n(3), scale, (xx, yy, ww, hh) =>
    p.rect(xx, yy, ww, hh, '#18191d', M_NONE),
  );
  drawText(text, tx0, ty0, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, fgHex, '#00c800'));
}

/** Neon sign: thin iron frame, dark ground, tube letters with a soft halo; glows at dusk. */
function paintNeonSign(p, r, text, fgHex, bgHex) {
  const { x, y, w, h } = r;
  p.rect(x, y, w, h, '#0c0b10');
  p.rect(x + 3, y + 3, w - 6, h - 6, bgHex);
  const scale = textWidth(text, 7) <= w - 30 ? 7 : textWidth(text, 6) <= w - 26 ? 6 : 5;
  const tw = textWidth(text, scale);
  const tx = x + ((w - tw) >> 1);
  const ty = y + ((h - 5 * scale) >> 1);
  // Halo one pixel around every stroke, then the bright tube core
  drawText(text, tx, ty, scale, (xx, yy, ww, hh) =>
    p.rect(xx - 1, yy - 1, ww + 2, hh + 2, '#3a2632', '#006000'),
  );
  drawText(text, tx, ty, scale, (xx, yy, ww, hh) => {
    p.rect(xx, yy, ww, hh, fgHex, M_NEON);
    p.rect(xx + 1, yy + 1, Math.max(1, ww - 2), Math.max(1, hh - 2), '#fff4f0', M_NEON);
  });
}

/** Rock-faced (quarry-faced) masonry: rough bulging blocks in deep joints (Romanesque). */
function paintRockFaced(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#6f675d', M_TINT);
  const ch = 32;
  for (let y = 0, row = 0; y < h; y += ch, row++) {
    let x = -((row * 23) % 40);
    while (x < w) {
      const bw = rng.int(34, 52);
      const bx = Math.max(0, x + 2);
      const cw = Math.min(w, x + bw - 2) - bx;
      if (cw > 4) {
        p.rect(
          x0 + bx,
          y0 + y + 2,
          cw,
          ch - 4,
          rng.pick(['#d9cfc1', '#cfc4b4', '#e2d9cc']),
          M_TINT,
        );
        // Bulging face: lit crown, shaded lower and right margins
        p.rect(x0 + bx + 3, y0 + y + 4, cw - 8, 4, '#efe8dd', M_TINT);
        p.rect(x0 + bx, y0 + y + ch - 8, cw, 4, '#a89d8e', M_TINT);
        p.rect(x0 + bx + cw - 3, y0 + y + 2, 3, ch - 4, '#9e9385', M_TINT);
        p.speckle(
          x0 + bx + 2,
          y0 + y + 6,
          cw - 4,
          ch - 14,
          ['#b9ae9f', '#f2ece3', '#c5baab'],
          30,
          rng,
          M_TINT,
        );
      }
      x += bw;
    }
  }
}

/** Flemish bond: every course alternates stretchers and dark glazed headers (Federal). */
function paintFlemishBond(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#b8ad9f', M_TINT);
  const bh = 11;
  for (let y = 0, row = 0; y < h; y += bh, row++) {
    let x = row % 2 ? -20 : 0;
    let header = false;
    while (x < w) {
      const bw = header ? 12 : 26;
      const bx = Math.max(0, x);
      const cw = Math.min(w, x + bw - 2) - bx;
      if (cw > 1) {
        const tone = header
          ? rng.pick(['#7d6c5f', '#86756a', '#74655a'])
          : rng.pick(['#e6dbcd', '#ddd1c2', '#efe6da', '#d6c9b9']);
        p.rect(x0 + bx, y0 + y, cw, Math.min(bh - 2, h - y), tone, M_TINT);
        p.rect(x0 + bx, y0 + y, cw, 1, header ? '#9a8a7d' : '#f7f1e8', M_TINT);
      }
      x += bw;
      header = !header;
    }
  }
}

/** Painted brick: the bond shows through thick paint – very low contrast, a few chips. */
function paintPaintedBrick(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#ddd8d0', M_TINT);
  for (let y = 0, row = 0; y < h; y += 11, row++) {
    for (let x = -(row % 2) * 13; x < w; x += 26) {
      const bx = Math.max(0, x);
      const cw = Math.min(w, x + 24) - bx;
      if (cw > 1)
        p.rect(
          x0 + bx,
          y0 + y,
          cw,
          Math.min(9, h - y),
          rng.pick(['#f1eee8', '#ece8e1', '#efebe4']),
          M_TINT,
        );
    }
  }
  for (let i = 0; i < 9; i++) {
    p.rect(
      x0 + rng.int(2, w - 8),
      y0 + rng.int(2, h - 6),
      rng.int(2, 5),
      rng.int(1, 3),
      '#c9b8a8',
      M_TINT,
    );
  }
}

/** Fish-scale slate: staggered rows of round-butt shingles with shadow lines (mansards). */
function paintFishscaleSlate(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  const sw = 16;
  const sh = 16;
  p.rect(x0, y0, w, h, '#5c6066', M_TINT);
  for (let y = 0, row = 0; y < h; y += sh, row++) {
    for (let x = (row % 2) * (sw >> 1) - sw; x < w; x += sw) {
      const tone = rng.pick(['#c9ccd1', '#bfc3c9', '#d2d5d9', '#b6bac1']);
      for (let yy = 0; yy < sh; yy++) {
        // Rounded butt: the lower rows narrow toward the scallop
        const lower = Math.max(0, yy - (sh - 6));
        const inset = lower === 0 ? 1 : Math.round(lower * lower * 0.35) + 1;
        const bx = Math.max(0, x + inset);
        const cw = Math.min(w, x + sw - inset) - bx;
        if (cw > 0) p.rect(x0 + bx, y0 + y + yy, cw, 1, yy === 0 ? '#e3e5e8' : tone, M_TINT);
      }
    }
    p.rect(x0, y0 + y, w, 1, '#3f4247', M_TINT);
  }
}

/**
 * Diamond-cut slate: a lattice of slates hung point down, every course offset by half a slate,
 * so the exposed faces read as diamonds – a lit upper-left edge, a shaded lower-right one and
 * dark keyways between. Tinted (a band of red slate between grey fish-scale courses), tiles
 * seamlessly both ways.
 */
function paintDiamondSlate(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  const sw = 16;
  const half = 16;
  p.rect(x0, y0, w, h, '#3c3f44', M_TINT);
  // One horizontal run of a diamond, wrapped round the tile's edges
  const run = (xa, xb, yy, col) => {
    const y = y0 + ((yy % h) + h) % h;
    for (let xs = xa; xs < xb; ) {
      const xm = ((xs % w) + w) % w;
      const len = Math.min(xb - xs, w - xm);
      p.rect(x0 + xm, y, len, 1, col, M_TINT);
      xs += len;
    }
  };
  for (let j = 0; j < h / half; j++) {
    for (let i = 0; i < w / sw; i++) {
      const cx = i * sw + (j % 2) * (sw >> 1);
      const cy = j * half;
      const tone = rng.pick(['#c6c9ce', '#bcc0c6', '#ced1d5', '#b3b7be']);
      for (let dy = -half + 2; dy < half - 1; dy++) {
        const hw = Math.floor((sw >> 1) * (1 - Math.abs(dy) / half)) - 1;
        if (hw <= 0) continue;
        run(cx - hw, cx + hw, cy + dy, tone);
        // Lit upper-left edge, shaded lower-right edge
        if (dy < 0) run(cx - hw, cx - hw + 1, cy + dy, '#e2e4e7');
        else run(cx + hw - 1, cx + hw, cy + dy, '#8d9198');
      }
    }
  }
}

/**
 * A row of books standing on a shelf, seen from the front: spines 6–14 px thick (1–3 cm) in
 * cloth and leather colours, a little shorter or taller each, with gilt bands, a darker title
 * label and a lit edge – the shelf's dark back showing over the shorter ones. No real titles.
 * Untinted; tiles seamlessly along the row.
 */
function paintBookSpines(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  const cloth = [
    '#7a2a2a', '#2f4a6e', '#3f6a48', '#b8862e', '#5a3a6e', '#8a5a34', '#d8cfb8', '#264a4a',
    '#a43c30', '#4e5a2a', '#c8a050', '#1f2a44', '#6e2440', '#9c7a52',
  ];
  p.rect(x0, y0, w, h, '#24180f');
  for (let x = 0; x < w; ) {
    const bw = Math.min(w - x, rng.int(6, 14));
    const top = rng.int(0, 22);
    const col = rng.pick(cloth);
    const light = col === '#d8cfb8' || col === '#c8a050' || col === '#b8862e';
    const gilt = light ? '#5a4024' : '#e2c46a';
    p.rect(x0 + x, y0 + top, bw, h - top, col);
    // Rounded spine: a lit left edge, a dark gap to the next book
    p.rect(x0 + x, y0 + top, 1, h - top, '#ffffff30');
    p.rect(x0 + x + bw - 1, y0 + top, 1, h - top, '#00000066');
    // Gilt bands near head and tail, a title label between them
    const band = rng.int(0, 2);
    for (const by of [top + 8, h - 12]) if (band !== 1) p.rect(x0 + x + 1, y0 + by, bw - 2, 2, gilt);
    if (bw >= 8) {
      const ly = top + 18 + rng.int(0, 16);
      p.rect(x0 + x + 2, y0 + ly, bw - 4, rng.int(14, 26), light ? '#3a2a20' : '#00000040');
      for (let k = 0; k < 3; k++) p.rect(x0 + x + 3, y0 + ly + 3 + k * 4, bw - 6, 1, gilt);
    }
    x += bw;
  }
}

/**
 * Kawara: grey Japanese clay roof tiles (tinted) – rows of round cover tiles over the hollow pan
 * tiles between them run down the slope (along V), the courses overlap across it, every one
 * showing the lip of the course above.
 */
function paintKawara(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#8c8c8c', M_TINT);
  const pitch = 32;
  for (let x = 0; x < w; x += pitch) {
    // The hollow pan: dark at its sides, a little lighter in the trough
    p.rect(x0 + x, y0, pitch, h, '#7a7a7a', M_TINT);
    p.rect(x0 + x + 2, y0, 4, h, '#868686', M_TINT);
    // The round cover tile over the joint: a shaded roll with a lit crown
    const cx = x + pitch - 8;
    const shades = ['#5e5e5e', '#8e8e8e', '#b4b4b4', '#d2d2d2', '#dcdcdc', '#c4c4c4', '#a0a0a0', '#727272'];
    for (let k = 0; k < 16; k++) {
      p.rect(x0 + ((cx - 8 + k + w) % w), y0, 1, h, shades[k >> 1], M_TINT);
    }
  }
  // Courses: each overlaps the next, a dark shadow line under a bright lip, a few weathered tiles
  for (let y = 0; y < h; y += pitch) {
    p.rect(x0, y0 + y + pitch - 3, w, 2, '#4e4e4e', M_TINT);
    p.rect(x0, y0 + y + pitch - 1, w, 1, '#a8a8a8', M_TINT);
    for (let k = 0; k < 3; k++) {
      const sx = rng.int(0, w / pitch - 1) * pitch;
      p.rect(x0 + sx + 2, y0 + y + 4, pitch - 12, pitch - 9, rng.pick(['#828282', '#969696']), M_TINT);
    }
  }
}

/**
 * London plane bark: an olive-grey ground flaking into irregular plates – cream where the old
 * bark has just fallen, khaki and grey-green on the older plates – each with a darker rim. The
 * plates wrap round the tile's left and right edges (the trunk is a tube).
 */
function paintPlaneBark(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#7d7a5e');
  const plates = ['#d9d2ae', '#cbbf8e', '#a59a6c', '#8a8c68', '#6f7558', '#b9b28a'];
  for (let i = 0; i < 46; i++) {
    const cx = rng.int(0, w - 1);
    const cy = rng.int(0, h - 1);
    const rx = rng.int(5, 15);
    const ry = rng.int(7, 20);
    const col = rng.pick(plates);
    const wob = rng.range(0, 6.28);
    for (let yy = -ry - 1; yy <= ry + 1; yy++) {
      for (let xx = -rx - 1; xx <= rx + 1; xx++) {
        // A lumpy oval: its edge wobbles with the angle
        const a = Math.atan2(yy, xx);
        const k = 1 + 0.22 * Math.sin(a * 3 + wob) + 0.12 * Math.sin(a * 5 - wob);
        const d = Math.hypot(xx / rx, yy / ry) / k;
        if (d > 1.08) continue;
        const px = x0 + ((cx + xx + w) % w);
        const py = y0 + Math.min(h - 1, Math.max(0, cy + yy));
        p.px(px, py, d > 0.92 ? '#5d5c45' : col);
      }
    }
  }
}

/**
 * Noren (2:1): the indigo curtain over a ramen bar's door, dyed with a white crest – a bowl of
 * noodles with chopsticks in a ring – and a white band along its foot.
 */
function paintNoren(p, t) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#1f2c52');
  p.rect(x0, y0, w, 3, '#16203e');
  p.rect(x0, y0 + h - 8, w, 3, '#e8e4da');
  const cx = w / 2;
  const cy = h / 2 - 3;
  for (let yy = 0; yy < h - 10; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const dx = xx + 0.5 - cx;
      const dy = yy + 0.5 - cy;
      const r = Math.hypot(dx, dy);
      // The ring, and inside it the bowl (a half disc) under its rim
      const ring = r >= 17 && r < 20;
      const bowl = dy >= 1 && r < 11;
      const rim = dy >= -1 && dy < 1 && Math.abs(dx) < 12;
      if (ring || bowl || rim) p.rect(x0 + xx, y0 + yy, 1, 1, '#ece8de');
    }
  }
  // Chopsticks resting across the bowl, steam rising from it
  for (let k = 0; k < 12; k++) {
    p.rect(x0 + cx + 2 + k, y0 + cy - 2 - (k >> 1), 1, 1, '#ece8de');
    p.rect(x0 + cx + 5 + k, y0 + cy - 2 - (k >> 1), 1, 1, '#ece8de');
  }
  for (const sx of [-5, 0]) {
    for (let k = 0; k < 6; k++) p.rect(x0 + cx + sx + (k % 2), y0 + cy - 4 - k, 1, 1, '#b8c0d8');
  }
}

/**
 * The display face of a news kiosk's street rack (256 × 128, 2:1): an upper tier of magazines
 * standing in a row – bright covers with a blank masthead band, a picture and lines of «text» –
 * and a lower tier of folded newspapers, headline bars over columns of grey text strips and a
 * photo. No real titles anywhere. Untinted.
 */
function paintNewsRack(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  const ledge = (yy) => {
    p.rect(x0, y0 + yy, w, 6, '#5a3a24');
    p.rect(x0, y0 + yy, w, 1, '#8a6040');
  };
  p.rect(x0, y0, w, h, '#2e2018');
  // Magazines: covers 30 wide, a little gap and a shadow on the right of each
  const covers = ['#c8423a', '#2f6db0', '#e0b43c', '#3f8f5a', '#d86fa0', '#6a4fa8', '#e8e2d2', '#e07a34'];
  const cw = 30;
  const n = Math.floor(w / (cw + 2));
  const mx0 = x0 + ((w - n * (cw + 2)) >> 1);
  for (let i = 0; i < n; i++) {
    const cx = mx0 + i * (cw + 2) + 1;
    const cy = y0 + 4 + rng.int(0, 2);
    const ch = 54;
    const bg = covers[(i * 3 + rng.int(0, 7)) % covers.length];
    const light = bg === '#e8e2d2' || bg === '#e0b43c';
    const ink = light ? '#2a2420' : '#f4efe6';
    p.rect(cx, cy, cw, ch, bg);
    p.rect(cx + cw - 2, cy, 2, ch, '#00000033');
    // Masthead band: a blank block of colour across the top
    p.rect(cx + 2, cy + 3, cw - 4, 7, ink);
    p.rect(cx + 3, cy + 4, cw - 6, 5, bg);
    for (let k = 0; k < 4; k++) p.rect(cx + 4 + k * 6, cy + 5, 4, 3, ink);
    // Picture: a round «face» or a block of colour
    const pic = covers[(i * 5 + 3) % covers.length];
    if (i % 2) {
      p.rect(cx + 8, cy + 16, 14, 18, pic === bg ? '#f0d8b8' : pic);
      p.rect(cx + 10, cy + 14, 10, 4, pic === bg ? '#f0d8b8' : pic);
      p.rect(cx + 6, cy + 32, 18, 6, '#00000044');
    } else {
      p.rect(cx + 4, cy + 14, cw - 8, 20, pic === bg ? '#f4efe6' : pic);
      p.rect(cx + 6, cy + 26, cw - 12, 6, '#00000033');
    }
    // Cover lines
    for (let k = 0; k < 3; k++) p.rect(cx + 4, cy + 40 + k * 4, cw - 8 - rng.int(0, 10), 2, ink);
  }
  ledge(60);
  // Newspapers: folded front pages, 60 wide, overlapping a little
  const pw = 60;
  const m = Math.floor(w / (pw - 4));
  const nx0 = x0 + ((w - (m * (pw - 4) + 4)) >> 1);
  for (let i = 0; i < m; i++) {
    const px = nx0 + i * (pw - 4);
    const py = y0 + 68 + rng.int(0, 2);
    const ph = 54;
    const paper = rng.pick(['#e9e5da', '#e2ddcf', '#ece8de']);
    p.rect(px, py, pw, ph, paper);
    p.rect(px + pw - 2, py, 2, ph, '#00000026');
    // Nameplate: a dark band with blank blocks, then the headline bars
    p.rect(px + 3, py + 3, pw - 6, 8, '#2a2a2c');
    for (let k = 0; k < 6; k++) p.rect(px + 6 + k * 8, py + 5, 5, 4, paper);
    p.rect(px + 3, py + 14, pw - 6 - rng.int(0, 12), 4, '#1f1f22');
    p.rect(px + 3, py + 20, pw - 14 - rng.int(0, 10), 3, '#3a3a3e');
    // Photo and three columns of grey text strips
    const photoLeft = i % 2 === 0;
    p.rect(photoLeft ? px + 3 : px + pw - 23, py + 26, 20, 16, '#6e6c68');
    p.rect(photoLeft ? px + 5 : px + pw - 21, py + 32, 16, 8, '#4a4846');
    for (let col = 0; col < 3; col++) {
      const tx = px + 3 + col * 18;
      for (let ty = py + 26; ty < py + ph - 3; ty += 3) {
        const inPhoto = photoLeft ? col === 0 && ty < py + 43 : col === 2 && ty < py + 43;
        if (!inPhoto) p.rect(tx, ty, 16 - (ty % 7 === 0 ? 5 : 0), 1, '#8c8a84');
      }
    }
  }
  ledge(h - 6);
}

/** Plain rectangular slate in staggered courses with dark keyways. */
function paintRectSlate(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  p.rect(x0, y0, w, h, '#45484d', M_TINT);
  for (let y = 0, row = 0; y < h; y += 14, row++) {
    for (let x = (row % 2) * -11; x < w; x += 22) {
      const bx = Math.max(0, x + 1);
      const cw = Math.min(w, x + 21) - bx;
      if (cw <= 0) continue;
      p.rect(
        x0 + bx,
        y0 + y + 1,
        cw,
        Math.min(12, h - y - 1),
        rng.pick(['#bcc0c6', '#b3b7be', '#c6c9ce']),
        M_TINT,
      );
      p.rect(x0 + bx, y0 + y + 1, cw, 1, '#dcdee1', M_TINT);
    }
  }
}

/**
 * Painted joinery: planks under a coat of paint – light neutral greys carrying the tint mask,
 * so doors, shopfront frames and trim take their paint colour from the vertex colour (the
 * plain `wood` tile is natural, untinted timber).
 */
function paintPaintedWood(p, t, rng) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#d8d8d6', M_TINT);
  for (let yy = 0; yy < h; yy += 16) {
    p.rect(x, y + yy, w, 14, rng.pick(['#dcdcda', '#d4d4d2', '#e0e0de']), M_TINT);
    p.rect(x, y + yy, w, 1, '#f0f0ee', M_TINT);
    p.rect(x, y + yy + 14, w, 2, '#a9a9a7', M_TINT);
    for (let g = 0; g < 3; g++) {
      p.rect(
        x + rng.int(0, w - 30),
        y + yy + rng.int(3, 11),
        rng.int(12, 28),
        1,
        '#cacac8',
        M_TINT,
      );
    }
  }
}

/**
 * Ghost sign: a hand-painted wall advertisement faded into the brick of a party wall. The
 * brick (tint mask: takes the wall colour) shows through the worn paint – a dark ground
 * band, cream lettering and a thin border, all eroded by weather.
 */
function paintGhostSign(p, t, rng) {
  const { x: x0, y: y0, w, h } = t;
  // Common brick under the paint (tinted by the wall)
  p.rect(x0, y0, w, h, '#b9b0a4', M_TINT);
  for (let y = 0, row = 0; y < h; y += 8, row++) {
    for (let x = (row % 2) * -9; x < w; x += 18) {
      const bx = Math.max(0, x);
      const cw = Math.min(w, x + 16) - bx;
      if (cw > 0) p.rect(x0 + bx, y0 + y, cw, Math.min(6, h - y), rng.pick(['#e2d9cc', '#d8cebf', '#ebe3d8']), M_TINT);
    }
  }
  // Worn paint: dark ground, border, two lines of lettering
  const paint = (px, py, pw, ph, hex) => {
    for (let yy = 0; yy < ph; yy += 2) {
      for (let xx = 0; xx < pw; xx += 2) {
        if (rng.next() < 0.78) p.rect(x0 + px + xx, y0 + py + yy, 2, 2, hex);
      }
    }
  };
  paint(10, 10, w - 20, h - 20, '#4b4a4f');
  paint(14, 14, w - 28, 3, '#cfc3a6');
  paint(14, h - 17, w - 28, 3, '#cfc3a6');
  const line = (text, scale, ty) => {
    const tx = (w - textWidth(text, scale)) >> 1;
    drawText(text, tx, ty, scale, (xx, yy, ww, hh) => paint(xx, yy, ww, hh, '#e3d7b9'));
  };
  line('ICE COLD', 6, 24);
  line('SODA WATER', 8, 62);
  // Weathering streaks washing down through the paint
  for (let i = 0; i < 26; i++) {
    const sx = rng.int(8, w - 10);
    p.rect(x0 + sx, y0 + rng.int(8, 40), 2, rng.int(20, 70), '#d8cebf', M_TINT);
  }
}

/** Date panel: the year cut into a stone or terracotta tablet (tinted by the vertex colour). */
function paintDatePanel(p, t, text, s = 6) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#ddd5c8', M_TINT);
  p.rect(x + 4, y + 4, w - 8, h - 8, '#d2c9ba', M_TINT);
  p.rect(x + 4, y + 4, w - 8, 2, '#f1ece4', M_TINT);
  const tx = x + ((w - textWidth(text, s)) >> 1);
  const ty = y + ((h - 5 * s) >> 1);
  const ink = (c) => (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, c, M_TINT);
  drawText(text, tx + 1, ty + 1, s, ink('#f3eee6'));
  drawText(text, tx, ty, s, ink('#6f6558'));
}

/** Round blade sign of a record shop: a black vinyl disc with grooves and a red label. */
function paintRecordBlade(p, t) {
  const { x, y, w, h } = t;
  const cx = w / 2;
  const cy = h / 2;
  p.rect(x, y, w, h, '#202024');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      let c = null;
      if (r < 13) c = r < 3 ? '#121214' : '#c8342c';
      else if (r < 22) c = '#e9e2d0';
      else if (r < 62) c = Math.floor(r) % 4 === 0 ? '#3a3a42' : '#18181c';
      else if (r < 64) c = '#5a5a64';
      if (c) p.rect(x + xx, y + yy, 1, 1, c);
    }
  }
  // Highlight sweep across the grooves
  for (let i = 0; i < 26; i++) p.rect(x + 34 + i, y + 30 + Math.round(i * 0.4), 2, 1, '#6c6c78');
}

/** Round blade sign of a bike workshop: a cream bicycle on a dark green enamel disc. */
function paintBikeBlade(p, t) {
  const { x, y, w, h } = t;
  const cream = '#efe6d2';
  p.rect(x, y, w, h, '#2e4636');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx + 0.5 - w / 2, yy + 0.5 - h / 2);
      if (r >= 58 && r < 64) p.rect(x + xx, y + yy, 1, 1, cream);
      else if (r >= 55 && r < 58) p.rect(x + xx, y + yy, 1, 1, '#1d2e24');
    }
  }
  // Wheels with hubs
  for (const [wx, wy] of [
    [38, 78],
    [90, 78],
  ]) {
    for (let yy = -20; yy <= 20; yy++) {
      for (let xx = -20; xx <= 20; xx++) {
        const r = Math.hypot(xx, yy);
        if ((r >= 15 && r < 19) || r < 3) p.rect(x + wx + xx, y + wy + yy, 1, 1, cream);
      }
    }
  }
  // Diamond frame, fork, saddle and handlebar as 3 px strokes
  const stroke = (ax, ay, bx, by) => {
    const n = Math.ceil(Math.hypot(bx - ax, by - ay));
    for (let i = 0; i <= n; i++) {
      const px = Math.round(ax + ((bx - ax) * i) / n);
      const py = Math.round(ay + ((by - ay) * i) / n);
      p.rect(x + px - 1, y + py - 1, 3, 3, cream);
    }
  };
  const [rear, crank, seat, head, front] = [
    [38, 78],
    [60, 79],
    [54, 52],
    [83, 52],
    [90, 78],
  ];
  stroke(...rear, ...crank);
  stroke(...rear, ...seat);
  stroke(...seat, ...crank);
  stroke(...seat, ...head);
  stroke(...head, ...crank);
  stroke(...head, ...front);
  stroke(...head, 80, 44);
  p.rect(x + 76, y + 41, 12, 3, cream);
  p.rect(x + 46, y + 47, 14, 4, cream);
  p.rect(x + 56, y + 76, 9, 7, cream);
}

/**
 * Barber's pole: diagonal red, white, blue, white stripes, 45° so that the tile repeats without
 * a seam both round the tube (U) and up it (V); a pale streak of the glass highlight runs
 * straight up. The stripes glow softly (neon mask) like the lit tube they are.
 */
function paintBarberPole(p, t) {
  const { x, y, w, h } = t;
  const stripes = ['#c8302c', '#f4f0e8', '#2c4c9c', '#f4f0e8'];
  const glow = '#00a000';
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const k = Math.floor(((xx + yy) % w) / (w / stripes.length));
      p.rect(x + xx, y + yy, 1, 1, stripes[k], glow);
    }
  }
  // Glass highlight and the shaded far side of the tube
  for (let yy = 0; yy < h; yy++) {
    p.rect(x + 38, y + yy, 6, 1, '#fffaf4', glow);
    p.rect(x + 96, y + yy, 18, 1, '#5a4a52', '#003000');
  }
}

/**
 * Chicago window: a wide fixed pane between two narrow double-hung sashes, cream mullions.
 * Drapes tied back at the sides of the big pane and blinds half down in the sashes are fabric
 * (vertex tint), so every flat dresses it in its own colour.
 */
function paintChicagoTile(p, t) {
  const { x, y, w, h } = t;
  const F = '#ece5d8';
  const Fs = '#a9a194';
  const bw = 7;
  const side = Math.round(w * 0.21);
  p.rect(x, y, w, h, F);
  p.rect(x, y + h - 2, w, 2, Fs);
  const panes = [
    [x + bw, side - bw - 3],
    [x + side + 3, w - side * 2 - 6],
    [x + w - side + 3, side - bw - 3],
  ];
  panes.forEach(([px, pw], i) => {
    const gy = y + bw;
    const gh = h - bw * 2;
    paintGlass(p, px, gy, pw, gh, false);
    if (i === 1) paintDrapes(p, px, gy, pw, gh);
    else {
      paintBlind(p, px, gy, pw, gh, 0.42);
      const meetY = gy + Math.round(gh * 0.5) - 3;
      p.rect(px, meetY, pw, 6, F);
      p.rect(px, meetY + 6, pw, 1, Fs);
    }
    p.rect(px, gy, pw, 2, Fs);
  });
}

/** Round blade sign of a tea salon: a cream teapot with steam on a dark green enamel disc. */
function paintTeapotBlade(p, t) {
  const { x, y, w, h } = t;
  const cream = '#efe6d2';
  const gold = '#d9b45a';
  p.rect(x, y, w, h, '#24402e');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx + 0.5 - w / 2, yy + 0.5 - h / 2);
      if (r >= 58 && r < 64) p.rect(x + xx, y + yy, 1, 1, gold);
      else if (r >= 55 && r < 58) p.rect(x + xx, y + yy, 1, 1, '#16291d');
    }
  }
  // Pot body (an ellipse), lid with a knob, spout and handle
  for (let yy = -22; yy <= 22; yy++) {
    for (let xx = -30; xx <= 30; xx++) {
      if ((xx / 30) ** 2 + (yy / 22) ** 2 <= 1) p.rect(x + 62 + xx, y + 76 + yy, 1, 1, cream);
    }
  }
  p.rect(x + 48, y + 50, 28, 6, cream);
  p.rect(x + 58, y + 43, 8, 7, cream);
  for (let i = 0; i < 18; i++) p.rect(x + 90 + i, y + 74 - Math.round(i * 0.9), 5, 4, cream);
  for (let a = -1.4; a <= 1.4; a += 0.05) {
    p.rect(x + 30 - Math.round(Math.cos(a) * 14), y + 76 + Math.round(Math.sin(a) * 15), 4, 4, cream);
  }
  p.rect(x + 40, y + 94, 44, 3, gold);
  // Steam rising from the spout
  for (let i = 0; i < 16; i++) {
    p.rect(x + 104 + Math.round(Math.sin(i * 0.6) * 3), y + 52 - i * 2, 2, 2, '#9fb5a5');
  }
}

/**
 * Lettering on a shop window: white sign-writer's letters with a drop shadow on dark glass. The
 * glass carries the glass mask, so the quad glows with the light behind the window it hangs on.
 */
function paintGlassLettering(p, r, text, fgHex, bgHex) {
  const { x, y, w, h } = r;
  p.rect(x, y, w, h, bgHex, M_GLASS);
  p.rect(x, y, w, 2, '#3e5470', M_GLASS);
  const scale = [7, 6, 5, 4].find((s) => textWidth(text, s) <= w - 16) ?? 3;
  const tx = x + ((w - textWidth(text, scale)) >> 1);
  const ty = y + ((h - 5 * scale) >> 1);
  drawText(text, tx + 1, ty + 1, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#1a2533'));
  drawText(text, tx, ty, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, fgHex));
}

/**
 * Exhibition banner: abstract shapes on an ivory ground – a red disc, a blue block, black bars –
 * and ART in black at the foot.
 */
function paintArtBanner(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#efe9dc');
  p.rect(x, y, w, 6, '#1d1d20');
  for (let yy = 0; yy < 64; yy++) {
    for (let xx = 0; xx < 64; xx++) {
      if (Math.hypot(xx - 31.5, yy - 31.5) < 31) p.rect(x + 22 + xx, y + 30 + yy, 1, 1, '#c8352c');
    }
  }
  p.rect(x + 14, y + 104, 70, 46, '#2b4c8c');
  p.rect(x + 60, y + 128, 54, 8, '#1d1d20');
  p.rect(x + 30, y + 164, 8, 30, '#1d1d20');
  p.rect(x + 46, y + 172, 60, 6, '#e3b23c');
  const tx = x + ((w - textWidth('ART', 8)) >> 1);
  drawText('ART', tx, y + h - 52, 8, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#1d1d20'));
}

/** Town flag: a dark blue – white – dark blue tricolour with a gilt disc in the middle. */
function paintTownFlag(p, t) {
  const { x, y, w, h } = t;
  const band = Math.round(h / 3);
  p.rect(x, y, w, h, '#f4f1e8');
  p.rect(x, y, w, band, '#24406b');
  p.rect(x, y + h - band, w, band, '#24406b');
  for (let yy = -22; yy <= 22; yy++) {
    for (let xx = -22; xx <= 22; xx++) {
      const r = Math.hypot(xx, yy);
      if (r <= 22) p.rect(x + w / 2 + xx, y + h / 2 + yy, 1, 1, r > 18 ? '#a8801e' : '#d9b45a');
    }
  }
}

/**
 * Vertical neon of a hotel: the letters stacked upright down a dark board, gold tubes with a
 * soft halo inside a red neon border; glows at dusk.
 */
function paintVerticalNeon(p, t, text, fgHex, bgHex, borderHex) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#0c0b10');
  p.rect(x + 3, y + 3, w - 6, h - 6, bgHex);
  // Border tube
  for (const [bx, by, bw, bh] of [
    [x + 6, y + 6, w - 12, 2],
    [x + 6, y + h - 8, w - 12, 2],
    [x + 6, y + 6, 2, h - 12],
    [x + w - 8, y + 6, 2, h - 12],
  ]) {
    p.rect(bx - 1, by - 1, bw + 2, bh + 2, '#3a2026', '#006000');
    p.rect(bx, by, bw, bh, borderHex, M_NEON);
  }
  const n = text.length;
  const s = Math.floor((h - 24) / (n * 5 + (n - 1) * 2));
  const step = s * 7;
  const ty0 = y + ((h - (n * 5 * s + (n - 1) * 2 * s)) >> 1);
  const tx = x + ((w - 3 * s) >> 1);
  for (let i = 0; i < n; i++) {
    const ty = ty0 + i * step;
    drawText(text[i], tx, ty, s, (xx, yy, ww, hh) =>
      p.rect(xx - 1, yy - 1, ww + 2, hh + 2, '#3a2632', '#006000'),
    );
    drawText(text[i], tx, ty, s, (xx, yy, ww, hh) => {
      p.rect(xx, yy, ww, hh, fgHex, M_NEON);
      p.rect(xx + 2, yy + 2, Math.max(1, ww - 4), Math.max(1, hh - 4), '#fff4e0', M_NEON);
    });
  }
}

/**
 * The street end of a hotel canopy: the name in gilt letters on dark green enamel between two
 * brass rules; the letters glow softly with the lamps.
 */
function paintCanopySign(p, t, text, fgHex, bgHex) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, bgHex);
  p.rect(x, y + 2, w, 3, '#c8a85a');
  p.rect(x, y + h - 5, w, 3, '#c8a85a');
  const s = [9, 8, 7, 6].find((k) => textWidth(text, k) <= w - 24 && 5 * k <= h - 14) ?? 5;
  const tx = x + ((w - textWidth(text, s)) >> 1);
  const ty = y + ((h - 5 * s) >> 1);
  drawText(text, tx + 2, ty + 2, s, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#0c1610'));
  drawText(text, tx, ty, s, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, fgHex, '#00c800'));
}

/**
 * Cast-metal letters fixed straight to the stone: dark bronze letters with a soft shadow on a
 * ground that takes the wall colour (tint mask), so only the letters show.
 */
function paintStoneLetters(p, r, text, fgHex, bgHex) {
  const { x, y, w, h } = r;
  p.rect(x, y, w, h, bgHex, M_TINT);
  const scale = [7, 6, 5, 4].find((s) => textWidth(text, s) <= w - 16) ?? 3;
  const tx = x + ((w - textWidth(text, scale)) >> 1);
  const ty = y + ((h - 5 * scale) >> 1);
  drawText(text, tx + 2, ty + 2, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#9d968a', M_TINT));
  drawText(text, tx, ty, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, fgHex));
}

/** Neo-Grec incised stone: machine-cut parallel grooves and a stylised rosette. */
function paintIncisedPanel(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#e4dccf', M_TINT);
  p.rect(x + 6, y + 6, w - 12, h - 12, '#ddd4c6', M_TINT);
  const groove = (gx, gy, gw, gh) => {
    p.rect(x + gx, y + gy, gw, gh, '#8b8173', M_TINT);
    p.rect(x + gx, y + gy + gh, gw, 1, '#f3eee6', M_TINT);
  };
  for (const gy of [16, 22, h - 25, h - 19]) groove(12, gy, w - 24, 2);
  const cx = w >> 1;
  const cy = h >> 1;
  for (const [dx, dy] of [
    [0, -14],
    [0, 14],
    [-14, 0],
    [14, 0],
  ]) {
    groove(cx + dx - 3, cy + dy - 3, 6, 6);
  }
  groove(cx - 2, cy - 10, 4, 20);
  groove(cx - 10, cy - 2, 20, 4);
  groove(12, cy - 1, 26, 2);
  groove(w - 38, cy - 1, 26, 2);
}

/**
 * Clock dial: a cream porcelain face that glows softly when lit from inside at dusk, a dark
 * chapter ring, twelve hour marks (the quarters heavier) and a brass bezel. Round in its square;
 * the hands are geometry (`Services.buildClockHands`).
 */
function paintClockDial(p, t) {
  const { x, y, w, h } = t;
  const cx = w / 2;
  const cy = h / 2;
  p.rect(x, y, w, h, '#6e5524');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      if (r < 50) p.rect(x + xx, y + yy, 1, 1, r < 46 ? '#f1e9d4' : '#e2d6b8', '#005800');
      else if (r < 53) p.rect(x + xx, y + yy, 1, 1, '#2c2622');
      else if (r < 61) p.rect(x + xx, y + yy, 1, 1, r < 57 ? '#d9b45a' : '#a8843a');
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const quarter = i % 3 === 0;
    const s = quarter ? 5 : 3;
    for (let k = quarter ? 34 : 39; k <= 47; k++) {
      const px = Math.round(cx + Math.sin(a) * k - s / 2);
      const py = Math.round(cy - Math.cos(a) * k - s / 2);
      p.rect(x + px, y + py, s, s, '#2c2622');
    }
  }
}

/**
 * Neon cocktail glass for a bar window: a cyan tube drawing the V of the glass, its stem and
 * foot, a pink line of the drink and a green olive on a pick, every tube with a dim halo, on a
 * dark board in a thin pink border. Lights up at dusk with the street lamps.
 */
function paintNeonCocktail(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#0c0b10');
  p.rect(x + 3, y + 3, w - 6, h - 6, '#141218');
  const stroke = (pts, color, core = '#f4fbff') => {
    for (const pass of [0, 1]) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let k = 0; k <= n; k++) {
          const px = Math.round(ax + ((bx - ax) * k) / n);
          const py = Math.round(ay + ((by - ay) * k) / n);
          if (pass === 0) p.rect(x + px - 2, y + py - 2, 5, 5, '#2a2030', '#006000');
          else {
            p.rect(x + px - 1, y + py - 1, 3, 3, color, M_NEON);
            p.rect(x + px, y + py, 1, 1, core, M_NEON);
          }
        }
      }
    }
  };
  // Border tube
  stroke(
    [
      [8, 8],
      [w - 9, 8],
      [w - 9, h - 9],
      [8, h - 9],
      [8, 8],
    ],
    '#e8508a',
    '#ffd8e6',
  );
  // The glass: bowl, stem, foot
  stroke(
    [
      [26, 30],
      [102, 30],
      [64, 72],
      [26, 30],
    ],
    '#4ad8e8',
  );
  stroke(
    [
      [64, 72],
      [64, 100],
    ],
    '#4ad8e8',
  );
  stroke(
    [
      [44, 102],
      [84, 102],
    ],
    '#4ad8e8',
  );
  // The drink and the olive on its pick
  stroke(
    [
      [36, 41],
      [92, 41],
    ],
    '#ff6fa8',
    '#ffe2ee',
  );
  stroke(
    [
      [56, 52],
      [84, 18],
    ],
    '#e8e0c8',
  );
  for (let yy = -6; yy <= 6; yy++) {
    for (let xx = -6; xx <= 6; xx++) {
      if (Math.hypot(xx, yy) <= 6) p.rect(x + 54 + xx, y + 54 + yy, 1, 1, '#7ee05a', M_NEON);
    }
  }
}

/**
 * Neon tubes on a dark board: every polyline `[pts, colour, core]` gets its dim halo first, then
 * the tubes go over all the halos, so crossing tubes stay lit where they meet.
 */
function paintNeonTubes(p, t, strokes) {
  const { x, y } = t;
  for (const pass of [0, 1]) {
    for (const [pts, color, core = '#f4fbff'] of strokes) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        const n = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let k = 0; k <= n; k++) {
          const px = Math.round(ax + ((bx - ax) * k) / n);
          const py = Math.round(ay + ((by - ay) * k) / n);
          if (pass === 0) p.rect(x + px - 2, y + py - 2, 5, 5, '#1e2a24', '#006000');
          else {
            p.rect(x + px - 1, y + py - 1, 3, 3, color, M_NEON);
            p.rect(x + px, y + py, 1, 1, core, M_NEON);
          }
        }
      }
    }
  }
}

/**
 * Neon Rx for a pharmacy window: the R in green tube with its leg run on through the crossing
 * stroke of the x, inside a thin white border tube, on a dark board. Lights up at dusk with the
 * street lamps.
 */
function paintNeonRx(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#0b0f0d');
  p.rect(x + 3, y + 3, w - 6, h - 6, '#111814');
  const green = '#4ee68a';
  paintNeonTubes(p, t, [
    [
      [
        [8, 8],
        [w - 9, 8],
        [w - 9, h - 9],
        [8, h - 9],
        [8, 8],
      ],
      '#d8efe2',
      '#ffffff',
    ],
    [
      [
        [34, 98],
        [34, 26],
      ],
      green,
    ],
    [arcPts(34, 44, 28, 18, -90, 90), green],
    [
      [
        [38, 62],
        [96, 104],
      ],
      green,
    ],
    [
      [
        [66, 102],
        [98, 72],
      ],
      green,
    ],
  ]);
}

/**
 * Brass house numerals screwed to a painted door: gilt digits with a dark shadow on a ground
 * that takes the door's own paint (tint mask), so only the numerals show.
 */
function paintBrassNumerals(p, t, text) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#c6c2bc', M_TINT);
  const s = [9, 8, 7, 6].find((k) => textWidth(text, k) <= w - 16 && 5 * k <= h - 12) ?? 5;
  const tx = x + ((w - textWidth(text, s)) >> 1);
  const ty = y + ((h - 5 * s) >> 1);
  drawText(text, tx + 2, ty + 2, s, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, '#3a3328', M_TINT));
  drawText(text, tx, ty, s, (xx, yy, ww, hh) => {
    p.rect(xx, yy, ww, hh, '#c9a24e');
    p.rect(xx, yy, ww, Math.max(1, hh >> 2), '#f0d58a');
  });
}

/** Points along an elliptical arc (pixel space, Y down), angles in degrees. */
function arcPts(cx, cy, rx, ry, a0, a1, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

/**
 * Script neon of a 1950s diner: "Burgers" written in one slanted line of red tube with a white
 * core and a swash under the word, on a cream porcelain-enamel panel. Each tube throws a soft
 * shadow on the panel; the tubes glow (neon mask).
 */
function paintScriptNeon(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#efe6d0');
  p.rect(x, y, w, 3, '#fbf6ea');
  p.rect(x, y + h - 3, w, 3, '#cdbf9f');
  // Strokes drawn upright on a baseline at 88 px, then slanted forward
  const strokes = [
    // B: entry curl, stem, two bowls
    [
      [16, 36],
      [22, 26],
      [32, 22],
    ],
    [
      [32, 22],
      [32, 88],
    ],
    arcPts(32, 39, 20, 17, -90, 90),
    arcPts(32, 72, 25, 16, -90, 90),
    // u
    [
      [62, 80],
      [68, 56],
      [68, 80],
      ...arcPts(75, 80, 7, 7, 180, 0, 6).slice(1),
      [82, 56],
      [82, 82],
      [86, 88],
      [92, 84],
    ],
    // r
    [
      [92, 84],
      [97, 56],
      [103, 61],
      [108, 57],
      [106, 88],
      [113, 84],
    ],
    // g: bowl, stem and the looped tail
    arcPts(123, 72, 10, 14, 0, 360, 16),
    [
      [133, 58],
      [133, 104],
      ...arcPts(126, 104, 7, 7, 0, 180, 6).slice(1),
      [143, 86],
    ],
    // e
    [
      [143, 86],
      [149, 76],
      [159, 70],
      [157, 61],
      [150, 58],
      [144, 64],
      [143, 76],
      [148, 86],
      [156, 89],
      [163, 85],
    ],
    // r
    [
      [163, 85],
      [168, 56],
      [174, 61],
      [179, 57],
      [177, 88],
      [184, 84],
    ],
    // s
    [
      [184, 84],
      [190, 56],
      [197, 64],
      [199, 74],
      [195, 84],
      [188, 89],
      [180, 87],
    ],
    // The swash under the word, flicking up at its end
    [
      [20, 101],
      [70, 98],
      [140, 97],
      [196, 99],
      [212, 103],
      [220, 96],
    ],
  ];
  const slant = ([sx, sy]) => [sx + (88 - sy) * 0.2, sy];
  const all = strokes.flat().map(slant);
  const minX = Math.min(...all.map((q) => q[0]));
  const maxX = Math.max(...all.map((q) => q[0]));
  const dx = Math.round((w - (maxX - minX)) / 2 - minX);
  const walk = (pts, fn) => {
    const sp = pts.map(slant);
    for (let i = 0; i + 1 < sp.length; i++) {
      const [ax, ay] = sp[i];
      const [bx, by] = sp[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 0; k <= n; k++) {
        fn(Math.round(ax + ((bx - ax) * k) / n) + dx, Math.round(ay + ((by - ay) * k) / n));
      }
    }
  };
  // Shadows of the tubes on the enamel, the halo, then the tube and its hot core
  for (const s of strokes) walk(s, (px, py) => p.rect(x + px, y + py + 3, 4, 3, '#c9b896'));
  for (const s of strokes) walk(s, (px, py) => p.rect(x + px - 2, y + py - 2, 5, 5, '#f0a090', '#006000'));
  for (const s of strokes) walk(s, (px, py) => p.rect(x + px - 1, y + py - 1, 3, 3, '#ff3b2f', M_NEON));
  for (const s of strokes) walk(s, (px, py) => p.rect(x + px, y + py, 1, 1, '#ffe4dc', M_NEON));
}

/**
 * Round blade sign of a burger bar: a burger – sesame bun, lettuce, cheese, patty, bottom bun –
 * on a cream disc in a red enamel ring with a chrome rim.
 */
function paintBurgerBlade(p, t) {
  const { x, y, w, h } = t;
  const cx = w / 2;
  const cy = h / 2;
  p.rect(x, y, w, h, '#b8261e');
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const r = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
      let c = null;
      if (r < 46) c = '#f3ead6';
      else if (r < 58) c = '#c42a20';
      else if (r < 61) c = '#e9eef2';
      else if (r < 64) c = '#7d848c';
      if (c) p.rect(x + xx, y + yy, 1, 1, c);
    }
  }
  const disc = (dx, dy, rx, ry, color, top = true) => {
    for (let yy = -ry; yy <= ry; yy++) {
      if (top ? yy > 0 : yy < 0) continue;
      for (let xx = -rx; xx <= rx; xx++) {
        if ((xx / rx) ** 2 + (yy / ry) ** 2 <= 1) p.rect(x + dx + xx, y + dy + yy, 1, 1, color);
      }
    }
  };
  // Top bun with sesame seeds and a highlight
  disc(64, 60, 34, 22, '#d98a3a');
  disc(58, 52, 18, 9, '#eaa556');
  for (const [sx, sy] of [
    [48, 48],
    [60, 44],
    [72, 47],
    [54, 54],
    [80, 54],
    [66, 52],
  ]) {
    p.rect(x + sx, y + sy, 3, 2, '#fbf0d2');
  }
  // Lettuce frill, cheese with a drip, the patty, the bottom bun
  for (let i = 0; i < 70; i++) {
    p.rect(x + 29 + i, y + 60 + Math.round(Math.sin(i * 0.7) * 2), 1, 5, '#5aa83a');
  }
  p.rect(x + 31, y + 65, 66, 5, '#f2c230');
  p.rect(x + 74, y + 68, 7, 7, '#f2c230');
  p.rect(x + 30, y + 70, 68, 9, '#5a2e1a');
  p.rect(x + 30, y + 70, 68, 2, '#7a4428');
  disc(64, 80, 33, 9, '#d98a3a', false);
  p.rect(x + 31, y + 79, 66, 2, '#c47830');
}

/**
 * Porcelain-enamel facing panels of a 1950s shopfront: a 2 × 2 grid of glossy panels with
 * recessed seams and a soft sheen, all tint mask – the vertex colour gives the enamel colour.
 */
function paintEnamelPanels(p, t) {
  const { x, y, w, h } = t;
  p.rect(x, y, w, h, '#e6e6e6', M_TINT);
  const half = w >> 1;
  for (const ox of [0, half]) {
    for (const oy of [0, half]) {
      // Sheen: lighter towards the top left of every panel, a little darker at the foot
      p.rect(x + ox + 4, y + oy + 4, half - 10, 10, '#f6f6f6', M_TINT);
      p.rect(x + ox + 4, y + oy + 4, 8, half - 10, '#f2f2f2', M_TINT);
      p.rect(x + ox + 4, y + oy + half - 12, half - 8, 8, '#d6d6d6', M_TINT);
      // Seams: a dark joint with a bright bevel on the panel edge below/right of it
      p.rect(x + ox, y + oy, half, 2, '#8c8c8c', M_TINT);
      p.rect(x + ox, y + oy, 2, half, '#8c8c8c', M_TINT);
      p.rect(x + ox, y + oy + 2, half, 1, '#ffffff', M_TINT);
      p.rect(x + ox + 2, y + oy, 1, half, '#ffffff', M_TINT);
      // Fixing screw heads in the corners
      for (const [sx, sy] of [
        [6, 6],
        [half - 8, 6],
        [6, half - 8],
        [half - 8, half - 8],
      ]) {
        p.rect(x + ox + sx, y + oy + sy, 2, 2, '#a0a0a0', M_TINT);
      }
    }
  }
}

/**
 * Chrome trim: polished bands across V – dark edges, a bright body and a white highlight – so a
 * strip mapped with one repeat across its height reads as a rounded, mirror-bright moulding.
 */
function paintChrome(p, t) {
  const { x, y, w, h } = t;
  const bands = [
    [0, '#3c4046'],
    [0.1, '#7c858f'],
    [0.22, '#c6ced6'],
    [0.34, '#f4f8fb'],
    [0.42, '#ffffff'],
    [0.5, '#dfe6ec'],
    [0.62, '#9aa3ad'],
    [0.78, '#5d646c'],
    [0.9, '#30343a'],
  ];
  bands.forEach(([f, c], i) => {
    const y0 = Math.round(h * f);
    const y1 = Math.round(h * (bands[i + 1]?.[0] ?? 1));
    p.rect(x, y + y0, w, y1 - y0, c);
  });
  // A few reflections of the street running along the strip
  for (const [sx, sw] of [
    [14, 22],
    [62, 10],
    [94, 18],
  ]) {
    p.rect(x + sx, y + Math.round(h * 0.6), sw, Math.round(h * 0.12), '#6d7680');
  }
}

/**
 * Diagonal boards of a carriage-house gate: 45° tongue-and-groove boards (tile seamlessly both
 * ways), dark grooves and a little grain, tint mask for the paint colour.
 */
function paintDiagonalBoards(p, t) {
  const { x, y, w, h } = t;
  const period = 16;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const k = (xx + yy) % period;
      const c =
        k < 2
          ? '#6a6a6a'
          : k < 3
            ? '#f0f0f0'
            : (xx * 7 + yy * 3) % 23 === 0
              ? '#bdbdbd'
              : k > 12
                ? '#cfcfcf'
                : '#dedede';
      p.rect(x + xx, y + yy, 1, 1, c, M_TINT);
    }
  }
}

/**
 * Leaded stained glass (a Queen Anne transom): a lozenge of ruby round an amber flower on a
 * ground of pale amber quarries, a cobalt border along the top and the foot, black lead lines.
 * It repeats along a transom; the glass glows softly when the hall behind is lit (neon mask).
 */
function paintStainedGlass(p, t) {
  const { x, y, w, h } = t;
  const G = '#00a000';
  const lead = '#1c1a1a';
  p.rect(x, y, w, h, lead);
  const pane = (px, py, pw, ph, c) => p.rect(x + px, y + py, pw, ph, c, G);
  // Border bands, quarries in between
  for (const by of [3, h - 19]) {
    for (let bx = 3; bx < w - 3; bx += 20) pane(bx, by, 17, 16, bx % 40 === 3 ? '#2e4c9a' : '#3f68b8');
  }
  for (let qy = 22; qy < h - 22; qy += 14) {
    for (let qx = 3; qx < w - 3; qx += 14) pane(qx, qy, 11, 11, (qx + qy) % 28 ? '#e8c87a' : '#d9b060');
  }
  // Ruby lozenge with the amber flower and four green leaves
  const cx = w >> 1;
  const cy = h >> 1;
  for (let yy = -34; yy <= 34; yy++) {
    const span = 34 - Math.abs(yy);
    p.rect(x + cx - span - 2, y + cy + yy, (span + 2) * 2, 1, lead);
    if (span > 2) p.rect(x + cx - span, y + cy + yy, span * 2, 1, '#a8323a', G);
  }
  for (const [lx, ly] of [
    [-14, 0],
    [14, 0],
    [0, -14],
    [0, 14],
  ]) {
    p.rect(x + cx + lx - 5, y + cy + ly - 5, 10, 10, lead);
    p.rect(x + cx + lx - 4, y + cy + ly - 4, 8, 8, '#3f8a4a', G);
  }
  p.rect(x + cx - 8, y + cy - 8, 16, 16, lead);
  p.rect(x + cx - 6, y + cy - 6, 12, 12, '#f2c040', G);
}

/**
 * Queen Anne living-room window (1:1): the upper sash a clear centre pane framed by a border of
 * small coloured lights, the lower sash one big plate of glass with drapes (fabric mask, so the
 * flat dresses it in its own colour), cream joinery.
 */
function paintQueenAnneWindow(p, t) {
  const { x, y, w, h } = t;
  const F = '#ece5d8';
  const Fs = '#a9a194';
  const bw = 9;
  p.rect(x, y, w, h, F);
  p.rect(x, y + h - 3, w, 3, Fs);
  const gx = x + bw;
  const gy = y + bw;
  const gw = w - bw * 2;
  const gh = h - bw * 2;
  const meet = Math.round(gh * 0.4);
  // Upper sash: the centre pane, then the coloured border lights round its top and sides
  const cell = 17;
  const uh = meet - 4;
  paintGlass(p, gx, gy, gw, uh, false);
  const colours = ['#d8a038', '#a8323a', '#2e4c9a', '#2f7a4a', '#d8a038', '#7a4a9a'];
  let k = 0;
  const light = (lx, ly) => {
    p.rect(lx, ly, cell, cell, F);
    p.rect(lx + 2, ly + 2, cell - 4, cell - 4, colours[k++ % colours.length], M_GLASS);
    p.rect(lx + 3, ly + 3, 3, 2, '#f4ecd8', M_GLASS);
  };
  const across = Math.floor(gw / cell);
  const ox = gx + ((gw - across * cell) >> 1);
  for (let i = 0; i < across; i++) light(ox + i * cell, gy);
  for (let ly = gy + cell; ly + cell <= gy + uh; ly += cell) {
    light(ox, ly);
    light(ox + (across - 1) * cell, ly);
  }
  p.rect(ox + cell, gy + cell, gw - cell * 2, 2, F);
  // Lower sash: plate glass with the drapes tied back
  const ly0 = gy + meet + 4;
  paintGlass(p, gx, ly0, gw, gy + gh - ly0, false);
  paintDrapes(p, gx, ly0, gw, gy + gh - ly0);
  // Meeting rail
  p.rect(gx, gy + meet - 4, gw, 8, F);
  p.rect(gx, gy + meet + 4, gw, 1, Fs);
  p.rect(gx, gy, gw, 2, Fs);
}

/**
 * Sign of glazed ceramic tiles set in the wall: a grid of hand-made cream tiles with a cobalt
 * border and the shop name painted across them in cobalt.
 */
function paintTileSign(p, r, text, fgHex, bgHex) {
  const { x, y, w, h } = r;
  const s = 16;
  p.rect(x, y, w, h, '#8a8578');
  for (let ty = 0; ty < h; ty += s) {
    for (let tx = 0; tx < w; tx += s) {
      const edge = ty === 0 || tx === 0 || ty + s >= h || tx + s >= w;
      const c = edge ? (((tx + ty) / s) % 2 ? fgHex : '#3d5aa8') : bgHex;
      p.rect(x + tx + 1, y + ty + 1, s - 2, s - 2, c);
      p.rect(x + tx + 2, y + ty + 2, 4, 2, edge ? '#8aa0d8' : '#fbf8f0');
    }
  }
  const scale = [7, 6, 5, 4].find((k) => textWidth(text, k) <= w - 2 * s - 4) ?? 3;
  const tx0 = x + ((w - textWidth(text, scale)) >> 1);
  const ty0 = y + ((h - 5 * scale) >> 1);
  drawText(text, tx0, ty0, scale, (xx, yy, ww, hh) => p.rect(xx, yy, ww, hh, fgHex));
}

/**
 * Builds the 2048² diorama facade atlas (albedo + mask) and UV rect lookup.
 * @param {number} [seed=3]
 */
export function createFacadeAtlas(seed = 3) {
  const S = ATLAS_SIZE;
  const p = new AtlasPainter(S);
  const rng = new Rng(seed);
  const T = TILE_LAYOUT;

  for (const style of WALL_STYLES) {
    paintWall(p, style, T[`wall_${style}`].x, T[`wall_${style}`].y, C, C, rng);
  }
  paintQuoinStone(p, T.quoin_stone, rng);
  paintShutter(p, T.shutter, rng);

  paintWoodShutterTile(p, T.shutter_wood);
  paintBalconyIronTile(p, T.balcony_iron);
  paintCorniceDentil(p, T.cornice_dentil);

  paintSashTile(p, T.win_plain_cream, { frame: 'cream' });
  paintSashTile(p, T.win_plain_dark, { frame: 'dark' });
  paintSashTile(p, T.win_stair_cream, { frame: 'cream', dressing: 'stair' });
  paintSashTile(p, T.win_stair_dark, { frame: 'dark', dressing: 'stair' });
  paintSashTile(p, T.win_curtain_cream, { frame: 'cream', dressing: 'curtain' });
  paintSashTile(p, T.win_curtain_dark, { frame: 'dark', dressing: 'curtain' });
  paintSashTile(p, T.win_blind_cream, { frame: 'cream', dressing: 'blind' });
  paintSashTile(p, T.win_blind_dark, { frame: 'dark', dressing: 'blind' });
  paintSashTile(p, T.win_sheer_cream, { frame: 'cream', dressing: 'sheer' });
  paintSashTile(p, T.win_sheer_dark, { frame: 'dark', dressing: 'sheer' });
  paintSashTile(p, T.win_six_cream, { frame: 'cream', six: true });
  paintShopGlass(p, T.shop_glass);
  paintRamenSign(p, T.ramen_sign);
  paintLanternPaper(p, T.lantern_paper, T.lantern_glyph);
  paintDoorPlaque(p, T.plaque_118, '118');
  paintDoorPlaque(p, T.plaque_112, '112');
  paintDoorPlaque(p, T.plaque_114, '114');
  paintDoorPlaque(p, T.plaque_116, '116');

  const rngParts = new Rng(seed + 202);
  paintRockFaced(p, T.stone_rockfaced, rngParts);
  paintFlemishBond(p, T.brick_flemish, rngParts);
  paintPaintedBrick(p, T.brick_painted, rngParts);
  paintFishscaleSlate(p, T.slate_fishscale, rngParts);
  paintRectSlate(p, T.slate_rect, rngParts);
  paintIncisedPanel(p, T.incised_panel);
  paintPaintedWood(p, T.wood_paint, rngParts);
  paintGhostSign(p, T.ghost_sign, rngParts);
  paintRecordBlade(p, T.blade_record);
  paintBikeBlade(p, T.blade_bike);
  paintBarberPole(p, T.barber_pole);
  paintTeapotBlade(p, T.blade_teapot);
  paintChicagoTile(p, T.win_chicago);
  paintSashTile(p, T.win_parlor, { frame: 'cream', dressing: 'curtain' });
  paintSashTile(p, T.win_six_nine, { frame: 'cream', dressing: 'sheer', meet: 0.4, cols: 3 });
  paintArtBanner(p, T.banner_art);
  paintTownFlag(p, T.flag_town);
  paintDatePanel(p, T.inscription_town_hall, 'TOWN HALL', 8);
  paintDatePanel(p, T.inscription_post_office, 'POST OFFICE', 8);
  paintCanopySign(p, T.canopy_metropole, 'METROPOLE', '#e8c77a', '#1f3a2c');
  paintVerticalNeon(p, T.vsign_hotel, 'HOTEL', '#ffd27a', '#16141c', '#e8584a');
  for (const year of BUILDING_DATES) paintDatePanel(p, T[`date_${year}`], String(year));
  for (const n of HOUSE_NUMBERS) paintDoorPlaque(p, T[`plaque_${n}`], String(n));
  paintClockDial(p, T.clock_dial);
  paintNeonCocktail(p, T.neon_cocktail);
  paintDatePanel(p, T.tablet_150, '150');
  paintBrassNumerals(p, T.numerals_152, '152');
  paintVerticalNeon(p, T.vsign_bar, 'BAR', '#ff6fa8', '#141218', '#4ad8e8');
  paintScriptNeon(p, T.neon_burgers);
  paintBurgerBlade(p, T.blade_burger);
  paintEnamelPanels(p, T.enamel_panel);
  paintChrome(p, T.chrome);
  paintDiagonalBoards(p, T.boards_diagonal);
  paintStainedGlass(p, T.glass_stained);
  paintQueenAnneWindow(p, T.win_qa);
  paintNeonRx(p, T.neon_rx);
  paintBrassNumerals(p, T.numerals_166, '166');
  // Own RNG stream so the tiles above keep their exact look
  const rngChunk0 = new Rng(seed + 303);
  paintNewsRack(p, T.news_rack, rngChunk0);
  paintDiamondSlate(p, T.slate_diamond, rngChunk0);
  paintBookSpines(p, T.book_spines, new Rng(seed + 404));
  paintKawara(p, T.kawara, new Rng(seed + 505));
  paintNoren(p, T.noren);
  paintPlaneBark(p, T.bark_plane, new Rng(seed + 606));

  paintMisc(p, T, rng);

  // Heritage framed architectural fascia signboards (384 × 128 px) with drop-shadow typography
  const signRects = new Map();
  SIGN_TEXTS.forEach(([text, fgHex, bgHex], i) => {
    const r = { x: (i % 5) * 3 * C, y: (8 + Math.floor(i / 5)) * C, w: 3 * C, h: C };
    paintSignboard(p, r, text, fgHex, bgHex);
    signRects.set(text, toUv(r));
  });
  SHOP_SIGNS.forEach(([text, fgHex, bgHex, style], i) => {
    const r = {
      x: (i % 10) * SMALL_SIGN.w,
      y: 7 * C + Math.floor(i / 10) * SMALL_SIGN.h,
      w: SMALL_SIGN.w,
      h: SMALL_SIGN.h,
    };
    if (style === 'neon') paintNeonSign(p, r, text, fgHex, bgHex);
    else if (style === 'glass') paintGlassLettering(p, r, text, fgHex, bgHex);
    else if (style === 'letters') paintStoneLetters(p, r, text, fgHex, bgHex);
    else if (style === 'tiles') paintTileSign(p, r, text, fgHex, bgHex);
    else paintSignboard(p, r, text, fgHex, bgHex);
    signRects.set(text, toUv(r));
  });

  function toUv(r) {
    return [r.x / S, r.y / S, r.w / S, r.h / S];
  }

  const tiles = {};
  for (const [k, r] of Object.entries(T)) tiles[k] = toUv(r);

  // Trilinear mipmaps + 8x anisotropy eliminate high-res brick/mortar/slat Moiré & texel shimmering!
  const map = p.albedo.toTexture({ mipmaps: true, linear: true });
  const maskMap = p.mask.toTexture({ srgb: false, mipmaps: true, linear: true });

  return {
    map,
    maskMap,
    tiles,
    signs: signRects,
    signAspect: 3,
    dispose() {
      map.dispose();
      maskMap.dispose();
    },
  };
}
