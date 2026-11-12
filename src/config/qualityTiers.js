/**
 * Quality: the device tier chosen once at startup, and the ladder the adaptive governor
 * (`rendering/QualityGovernor.js`) walks at runtime.
 *
 * Measured on an integrated Intel UHD at 1600×900 (Stage 9): the frame is bound by pixels.
 * The whole frame at 0.85 / 0.7 / 0.6 / 0.5 of the resolution costs 46 / 32 / 24 / 17 ms
 * against 56 ms at full size; rain and leaves cost next to nothing there (they matter more on
 * phones, where alpha-blended streaks overdraw). Switching shadows or MSAA at runtime recompiles
 * every material (a 1.7–1.9 s freeze), so those are decided by the tier at startup only.
 */

/**
 * @typedef {object} QualityTier
 * @property {0 | 4} msaa        samples of the scene pass
 * @property {boolean} shadows   default of `render.shadows` (unless the URL sets it)
 * @property {number} maxDpr     cap on the device pixel ratio
 * @property {number} leaves     most leaves drawn, whatever `leaves.count` says
 * @property {number} startLevel the governor's first rung
 */

/** @type {Readonly<Record<'low' | 'medium' | 'high', QualityTier>>} */
export const QUALITY_TIERS = Object.freeze({
  low: { msaa: 0, shadows: false, maxDpr: 1.5, leaves: 400, startLevel: 2 },
  medium: { msaa: 4, shadows: true, maxDpr: 2, leaves: 1000, startLevel: 1 },
  high: { msaa: 4, shadows: true, maxDpr: 2, leaves: 2500, startLevel: 0 },
});

export const TIER_NAMES = Object.freeze(['low', 'medium', 'high']);

/**
 * @typedef {object} QualityRung
 * @property {string} label
 * @property {number} renderScale share of the device pixel ratio the frame is drawn at
 * @property {number} particles   share of the rain drops and leaves drawn
 */

/**
 * The governor's ladder, best first. One rung down costs ~1.2–1.45× less frame time on a
 * pixel-bound GPU.
 * @type {readonly QualityRung[]}
 */
export const QUALITY_LADDER = Object.freeze([
  { label: 'full', renderScale: 1, particles: 1 },
  { label: '85 %', renderScale: 0.85, particles: 0.8 },
  { label: '70 %', renderScale: 0.7, particles: 0.65 },
  { label: '60 %', renderScale: 0.6, particles: 0.5 },
  { label: '50 %', renderScale: 0.5, particles: 0.4 },
]);
