/**
 * Global constants. Units: metres, seconds, radians (unless a name says otherwise).
 * Data only – this layer imports nothing.
 */

/** Length of one street chunk along Z. */
export const CHUNK_LENGTH = 20;
/** Chunks kept behind the taxi (supports wide front/rear isometric camera arc). */
export const CHUNKS_BEHIND = 5;

// The street cross-section (road, curbs, sidewalks, taxi lane) lives in `streetProfile.js`.

/** Default depth of a building lot behind the building line. */
export const LOT_DEPTH = 8;
/** Index of the first chunk that contains a bus stop in the harmonic loop. */
export const STOP_CHUNK_OFFSET = 2;

export const MAX_RIPPLES = 16;
/** Puddle instances drawn at once (≈ 18 streamed chunks × up to 5 puddles + headroom). */
export const MAX_PUDDLES = 128;
export const MAX_SPLASH_PARTICLES = 384;
export const MAX_TRACK_STAMPS = 1024;
export const MAX_LEAVES = 2500;
export const MAX_RAIN_DROPS = 6000;

/** Wheel positions relative to the taxi centre: [x, z]. */
export const WHEEL_OFFSETS = Object.freeze([
  [0.82, 1.35],
  [-0.82, 1.35],
  [0.82, -1.25],
  [-0.82, -1.25],
]);
export const WHEEL_RADIUS = 0.34;
/** Tyre width (the wheel is centred on its `WHEEL_OFFSETS` X). */
export const WHEEL_WIDTH = 0.24;
