/**
 * Warm, muted miniature-diorama colour palettes (hex).
 * Tuned for cozy overcast/golden-hour isometric street scenes.
 */
export const DOOR_COLORS = Object.freeze([
  '#2f4d63', // heritage navy-teal
  '#6b3238', // wine red
  '#2f5753', // deep verdigris teal
  '#4d3829', // walnut timber
  '#3b4738', // olive wood
]);

export const LEAF_COLORS = Object.freeze(['#c97832', '#d4a342', '#7a9442', '#a84832']);

export const SIGN_TEXTS = Object.freeze([
  ['RAMEN', '#f7efe2', '#7d322c'],
  // Gilt letters on the navy fascia of the bookshop (№ 106)
  ['BOOKS', '#e9c46a', '#2d3f5e'],
  ['CAFE', '#f7efe4', '#4d382a'],
  ['24/7', '#d8f2dc', '#26362c'],
  ['FLOWERS', '#faeaf0', '#6e364d'],
  ['BAKERY', '#3d2818', '#dfc08e'],
  ['ARCADE', '#f2d4f7', '#32294a'],
  ['LAUNDRY', '#eef4f7', '#335973'],
  ['PIZZA', '#f7efe6', '#78302c'],
  ['TEA', '#e9c46a', '#24402e'],
  ['TOYS', '#faf0c8', '#384870'],
  ['BUS', '#f7f4eb', '#2b5078'],
]);

/**
 * Shop signs of the redesigned houses: `[text, letters, ground, style]`. Painted at half the
 * resolution of `SIGN_TEXTS` (192 × 64 px, still 3:1) – on a facade they are the same size, so
 * a letter pixel matches the BAKERY board. `board`: framed fascia board; `neon`: glowing tube
 * letters on a dark ground (they light up with the street lamps); `glass`: letters painted on
 * a shop window; `letters`: metal letters fixed to the stone (the ground takes the wall tint);
 * `tiles`: painted on glazed ceramic tiles set in the wall (a potter's).
 */
export const SHOP_SIGNS = Object.freeze([
  ['RECORDS', '#f4e9d2', '#2a3550', 'board'],
  ['BIKES', '#f2efe6', '#3b4a3a', 'board'],
  ['BARBER', '#f7f1e6', '#7a2a2a', 'board'],
  ['GALLERY', '#2a2622', '#e2ddd2', 'letters'],
  ['POST', '#f5f1e6', '#24406b', 'board'],
  ['HOTEL', '#ffd27a', '#16141c', 'neon'],
  ['BISTRO', '#e9c46a', '#3a1f24', 'board'],
  ['CLOCKS', '#e8d9b0', '#2f2a24', 'board'],
  ['BAR', '#ff6fa8', '#141218', 'neon'],
  ['BURGERS', '#ff5a4a', '#f2e8d4', 'board'],
  ['CERAMICS', '#24408e', '#efe9da', 'tiles'],
  // Bronze letters on the terracotta frieze of the 1930s taxpayer (№ 162)
  ['PRINT', '#2e2924', '#e2ddd2', 'letters'],
  ['PHARMACY', '#f3f6ef', '#2f5a45', 'board'],
  ['NEWS', '#f7f2e4', '#1f3a5a', 'board'],
  // Not a fascia: the violet neon hung in the arcade's window (№ 132)
  ['PLAY', '#d08cff', '#140c1e', 'neon'],
  // `glass`: sign-writer's letters on a shop window (№ 134's laundry)
  ['WASH & FOLD', '#f4f8fb', '#2d3e52', 'glass'],
  // Gilt letters on the bistro's window (№ 148)
  ['VINS', '#e9c46a', '#2a1a1c', 'glass'],
]);
