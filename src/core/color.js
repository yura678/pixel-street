/**
 * Hex colour helpers for the simulation layer (weather blends colours without three.js).
 * Colours are '#rrggbb' strings; channel values are 0..1 in sRGB space.
 */
import { clamp, lerp } from './math.js';

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

/**
 * Normalise '#ABC' / 'abc' / '#AABBCC' to lowercase '#aabbcc'. Returns null for invalid input.
 * @param {unknown} v
 * @returns {string|null}
 */
export function normalizeHex(v) {
  if (typeof v !== 'string') return null;
  const m = HEX_RE.exec(v.trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return `#${h}`;
}

/**
 * Parse '#rrggbb' into `out` (reused to stay allocation-free in hot paths).
 * @param {string} hex
 * @param {{r:number,g:number,b:number}} [out]
 */
export function hexToRgb(hex, out = { r: 0, g: 0, b: 0 }) {
  const n = parseInt(hex.charAt(0) === '#' ? hex.slice(1) : hex, 16);
  out.r = ((n >> 16) & 255) / 255;
  out.g = ((n >> 8) & 255) / 255;
  out.b = (n & 255) / 255;
  return out;
}

const toByte = (c) => Math.round(clamp(c, 0, 1) * 255);

/** @param {number} r @param {number} g @param {number} b – 0..1 */
export function rgbToHex(r, g, b) {
  const n = (toByte(r) << 16) | (toByte(g) << 8) | toByte(b);
  return `#${n.toString(16).padStart(6, '0')}`;
}

const A = { r: 0, g: 0, b: 0 };
const B = { r: 0, g: 0, b: 0 };

/** Linear blend of two hex colours in sRGB space. */
export function lerpHex(a, b, t) {
  hexToRgb(a, A);
  hexToRgb(b, B);
  return rgbToHex(lerp(A.r, B.r, t), lerp(A.g, B.g, t), lerp(A.b, B.b, t));
}
