/**
 * Interactive Diorama Camera Controller (`CameraRig`).
 *
 * Supports:
 *  - Left-drag / 1-finger touch drag : smooth turntable orbit (azimuth + elevation) with inertia
 *  - Mouse wheel / 2-finger pinch    : smooth telephoto zoom in & out
 *  - Right-drag / Shift+drag, W / S  : raise or lower the look point
 *  - Q / E                           : turn round the taxi
 *  - Double-click or `R` key         : smooth return to the signature Isometric view
 *  - `Space`                         : pause
 *  - Store `camera.mode` presets     : 'Isometric', 'Chase', 'Side', 'Orbit'
 *
 * The camera always follows the taxi: nothing the viewer does detaches it. Only scripts
 * (`scripts/shots.js`) place it elsewhere along the street with {@link CameraRig#teleportTo}.
 *
 * The viewer's camera is bounded (`STREETSCAPE_PLAN.md`, Stage B) so it never shows where the
 * world ends: the azimuth stays within ±60° of the frontal view from up high and a little less
 * the lower and wider the frame (`azimuthSpanFor`: a low frame never looks straight along the
 * near side), wide enough to see the world curve; and the camera never backs out past the near apron
 * (x = −24, `NEAR_EDGE_X`) – the further it swings or the lower it sits, the less it may zoom
 * out (`maxZoomFor`). The ends of the street sink below the horizon with the world curve.
 * Scripts that place the camera along the street (`teleportTo`, `scripts/shots.js`) keep the
 * wide limits.
 */
import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';

const DEFAULT_AZIMUTH = -Math.PI * 0.86; // ~ -155 deg

/** The viewer's limits: ±60° round the frontal view (−180°), up to 72° above the street. */
export const CAMERA_LIMITS = Object.freeze({
  minAzimuth: (-240 * Math.PI) / 180,
  maxAzimuth: (-120 * Math.PI) / 180,
  minElevation: 0.01, // ~0.6°: street level, looking straight into the shops
  maxElevation: 1.25, // ~72°: high aerial overview
  minZoom: 0.08, // close-up on door plaques and sills
  maxZoom: 2.4,
});
/** Where the ground ends behind the near sidewalk (`StreetProfileView` apron). */
export const NEAR_EDGE_X = -24;
/** How far short of `NEAR_EDGE_X` the camera stays (m). */
const NEAR_EDGE_MARGIN = 3;

// Scripted shots (`teleportTo`): the old, wide arc and zoom
const MIN_AZIMUTH = -Math.PI * 1.45; // ~ -261 deg
const MAX_AZIMUTH = -Math.PI * 0.55; // ~ -99 deg
const BASE_MIN_ELEVATION = 0.01;
const MAX_ELEVATION = 1.25;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.6;

/** Points of the frame (NDC) checked against the near edge: the lower corners and sides. */
const FRAME_PROBES = [
  [-1, -1],
  [1, -1],
  [-1, -0.5],
  [1, -0.5],
  [-1, 0],
  [1, 0],
];
const _ray = new THREE.Vector3();

/** Dampens drag delta smoothly as `val` approaches `[min, max]` so boundaries feel cushioned. */
function cushionedStep(val, delta, min, max) {
  const span = max - min;
  if (span <= 0 || delta === 0) return clamp(val, min, max);
  const margin = span * 0.16;
  let scale = 1.0;
  if (delta < 0 && val - min < margin) {
    scale = clamp((val - min) / margin, 0.1, 1.0);
  } else if (delta > 0 && max - val < margin) {
    scale = clamp((max - val) / margin, 0.1, 1.0);
  }
  return clamp(val + delta * scale, min, max);
}

/**
 * The farthest the viewer may zoom out at azimuth `az` and elevation `el`: the camera stays
 * `NEAR_EDGE_MARGIN` short of the near edge of the world.
 * @param {number} az
 * @param {number} el
 * @param {number} baseRadius camera distance at zoom 1
 * @param {number} anchorX X of the point the camera orbits
 */
export function maxZoomFor(az, el, baseRadius, anchorX) {
  const reach = anchorX - NEAR_EDGE_X - NEAR_EDGE_MARGIN;
  const back = Math.max(1e-3, -Math.cos(az)) * Math.cos(el) * baseRadius;
  return clamp(reach / back, CAMERA_LIMITS.minZoom, CAMERA_LIMITS.maxZoom);
}

/** Steepest yaw (from facing +X) any ray of a low frame may take: past it, the frame looks
 * straight along the near side (wide enough to see the world curve, 12.11.2026). */
const LOW_EDGE_YAW = (85 * Math.PI) / 180;
const MIN_SPAN = (15 * Math.PI) / 180;
const MAX_SPAN = (60 * Math.PI) / 180;

/** How much a low camera widens its field of view (`update`), 0 high … 1 at street level. */
function lowBlendOf(el) {
  const t = clamp((0.36 - el) / (0.36 - CAMERA_LIMITS.minElevation), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * How far the viewer may swing either side of the frontal view at elevation `el`: up high the
 * frame looks down on the street, so ±60°; low, the frame's edge must not look along the near
 * side (its yaw stays within `LOW_EDGE_YAW`), so the wider the frame, the less it may swing.
 * @param {number} el elevation (rad)
 * @param {number} aspect frame width / height
 * @param {number} baseFov `camera.fov` (deg, vertical)
 * @returns {number} half-span (rad)
 */
export function azimuthSpanFor(el, aspect, baseFov) {
  const fov = ((baseFov + 14.5 * lowBlendOf(el)) * Math.PI) / 180;
  const halfH = Math.atan(Math.tan(fov / 2) * aspect);
  const low = clamp(LOW_EDGE_YAW - halfH, MIN_SPAN, MAX_SPAN);
  const t = clamp((el - 0.5) / 0.6, 0, 1);
  return low + (MAX_SPAN - low) * t * t * (3 - 2 * t);
}

export class CameraRig {
  /** @type {THREE.PerspectiveCamera} */
  #camera;
  /** @type {import('../core/Store.js').Store} */
  #store;

  // Interactive spherical orbit targets & smoothed values
  #targetAzimuth = DEFAULT_AZIMUTH;
  #azimuth = DEFAULT_AZIMUTH;

  #targetElevation = 0.58;
  #elevation = 0.58;

  #targetZoom = 1.0;
  #zoom = 1.0;

  #targetPanY = 0.0;
  #targetPanZ = 0.0;
  #panY = 0.0;
  #panZ = 0.0;

  // Follows the taxi unless a script teleported it (`teleportTo`)
  #followTaxi = true;
  #freeAnchorZ = 48.0;

  // Smoothed anchor tracking along the street
  #anchorX = 2.15;
  #orbitY = 1.12;
  #anchorY = 1.05;
  #anchorZ = 1.4;

  // Active keyboard tracking
  #keysDown = new Set();

  // Pointer / touch gesture state
  #activePointers = new Map();
  #dragMode = null; // 'orbit' | 'pan' | 'pinch'
  #lastX = 0;
  #lastY = 0;
  #lastPinchDist = 0;

  onTogglePause = null;
  isPaused = false;

  #cleanupFns = [];

  /**
   * @param {import('../core/Store.js').Store} store
   * @param {HTMLElement | null} [domElement=null]
   */
  constructor(store, domElement = null) {
    this.#store = store;

    const fov = store.get('camera.fov') ?? 19;
    const aspect =
      typeof window !== 'undefined' && window.innerHeight > 0
        ? window.innerWidth / window.innerHeight
        : 16 / 9;
    this.#camera = new THREE.PerspectiveCamera(fov, aspect, 2.5, 230);

    // Derive initial orientation & elevation from configured mode, height & distance
    this.#applyModePreset(store.get('camera.mode') ?? 'Isometric');
    this.#azimuth = this.#targetAzimuth;
    this.#elevation = this.#targetElevation;

    if (typeof window !== 'undefined') {
      const onResize = () => {
        this.#camera.aspect = window.innerWidth / window.innerHeight;
        this.#camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);
      this.#cleanupFns.push(() => window.removeEventListener('resize', onResize));
    }

    const unsubFov = store.subscribe('camera.fov', () => {
      this.#camera.fov = store.get('camera.fov');
      this.#camera.updateProjectionMatrix();
    });
    const unsubMode = store.subscribe('camera.mode', () => {
      this.#applyModePreset(store.get('camera.mode'));
    });
    const unsubHeight = store.subscribe('camera.height', () => this.#syncElevationFromStore());
    this.#cleanupFns.push(unsubFov, unsubMode, unsubHeight);

    if (domElement) {
      this.#bindControls(domElement);
    }
  }

  get camera() {
    return this.#camera;
  }

  get azimuth() {
    return this.#azimuth;
  }

  get elevation() {
    return this.#elevation;
  }

  get zoom() {
    return this.#zoom;
  }

  get anchorX() {
    return this.#anchorX;
  }

  get anchorY() {
    return this.#anchorY;
  }

  get anchorZ() {
    return this.#anchorZ;
  }

  get followTaxi() {
    return this.#followTaxi;
  }

  togglePause() {
    this.onTogglePause?.();
  }

  /**
   * Jump directly to a world Z coordinate, detached from the taxi until `resetView()` (for
   * scripted shots; the viewer has no way to do this).
   * @param {object} opt
   * @param {number} opt.z
   * @param {number} [opt.y=1.5]
   * @param {number} [opt.zoom=0.45]
   * @param {number} [opt.az]
   * @param {number} [opt.el]
   * @param {boolean} [opt.immediate=false]
   */
  teleportTo({ z, y = 1.5, zoom = 0.45, az = -Math.PI * 0.86, el = 0.22, immediate = false } = {}) {
    this.#followTaxi = false;
    this.#freeAnchorZ = z;
    this.#targetPanZ = 0;
    this.#targetPanY = y - 1.12;
    this.#targetZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.#targetAzimuth = clamp(az, MIN_AZIMUTH, MAX_AZIMUTH);
    this.#targetElevation = clamp(el, BASE_MIN_ELEVATION, MAX_ELEVATION);

    if (immediate) {
      this.#anchorZ = z;
      this.#panZ = 0;
      this.#panY = this.#targetPanY;
      this.#zoom = this.#targetZoom;
      this.#azimuth = this.#targetAzimuth;
      this.#elevation = this.#targetElevation;
    }
  }

  /**
   * Point the camera round the taxi it keeps following, at once (within the viewer's limits,
   * applied on the next `update`).
   * @param {{ az?: number, el?: number, zoom?: number }} view
   */
  setView({ az = this.#targetAzimuth, el = this.#targetElevation, zoom = this.#targetZoom } = {}) {
    this.#followTaxi = true;
    this.#targetAzimuth = this.#azimuth = az;
    this.#targetElevation = this.#elevation = el;
    this.#targetZoom = this.#zoom = zoom;
  }

  /**
   * Set target & current zoom level within safe bounds.
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.#targetZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    this.#zoom = this.#targetZoom;
  }

  /**
   * Set target & current pan offset.
   * @param {number} panY vertical pan offset
   * @param {number} [panZ=0] longitudinal pan offset
   */
  setPan(panY, panZ = 0) {
    this.#targetPanY = panY;
    this.#targetPanZ = panZ;
    this.#panY = panY;
    this.#panZ = panZ;
  }

  /** Smoothly resets viewing angle, zoom, and pan back to the current mode preset. */
  resetView() {
    this.#targetZoom = 1.0;
    this.#targetPanY = 0.0;
    this.#targetPanZ = 0.0;
    this.#panY = 0.0;
    this.#panZ = 0.0;
    this.#followTaxi = true;
    this.#applyModePreset(this.#store.get('camera.mode') ?? 'Isometric');
  }

  /**
   * Update camera position and orientation.
   * @param {number} dt delta time in seconds
   * @param {number} time total elapsed time
   * @param {number} [targetX=0]
   * @param {number} [targetY=0]
   * @param {number} [targetZ=0]
   */
  update(dt, time, targetX = 0, targetY = 0, targetZ = 0) {
    const mode = this.#store.get('camera.mode') ?? 'Isometric';
    const baseDist = this.#store.get('camera.distance') ?? 16.2;
    const baseHeight = this.#store.get('camera.height') ?? 10.6;
    const smoothing = this.#store.get('camera.smoothing') ?? 5.5;
    const swayAmount = this.#store.get('camera.sway') ?? 0.04;

    // Keyboard: W / S and arrows up / down raise the look point, Q / E turn round the taxi
    if (this.#keysDown.size > 0 && dt > 0) {
      const speedMult = this.#keysDown.has('ShiftLeft') || this.#keysDown.has('ShiftRight') ? 2.5 : 1.0;
      let moveY = 0;
      let rotAz = 0;

      if (this.#keysDown.has('KeyW') || this.#keysDown.has('ArrowUp')) moveY += 1;
      if (this.#keysDown.has('KeyS') || this.#keysDown.has('ArrowDown')) moveY -= 1;
      if (this.#keysDown.has('KeyQ')) rotAz += 1;
      if (this.#keysDown.has('KeyE')) rotAz -= 1;

      if (moveY !== 0) {
        this.#targetPanY = clamp(this.#targetPanY + moveY * 9.0 * speedMult * dt, -0.8, 16.0);
      }
      if (rotAz !== 0) {
        const lim = this.#limits();
        this.#targetAzimuth = clamp(this.#targetAzimuth + rotAz * 2.0 * dt, lim.minAz, lim.maxAz);
      }
    }

    // Base spherical radius implied by `camera.distance` & `camera.height`, kept consistent at low angles
    const baseHoriz = baseDist * 1.018;
    const baseRadius = clamp(Math.hypot(baseHoriz, Math.max(baseHeight, 9.5)), 16.5, 22.0);

    // The viewer's limits while the camera rides with the taxi; scripts keep the wide ones
    const lim = this.#limits();
    this.#targetAzimuth = clamp(this.#targetAzimuth, lim.minAz, lim.maxAz);
    this.#targetElevation = clamp(this.#targetElevation, lim.minEl, lim.maxEl);
    if (this.#followTaxi) {
      // `Orbit` sweeps through the frontal view: cap the zoom for it
      const capAz = mode === 'Orbit' ? -Math.PI : this.#targetAzimuth;
      const zoomCap = maxZoomFor(capAz, this.#targetElevation, baseRadius, 1.75);
      this.#targetZoom = clamp(this.#targetZoom, lim.minZoom, zoomCap);
    }

    // Gentle turntable sweep across the front hemisphere when in 'Orbit' mode
    let desiredAz = this.#targetAzimuth;
    if (mode === 'Orbit' && this.#dragMode === null) {
      desiredAz = -Math.PI + Math.sin(time * 0.28) * 0.72;
    }
    desiredAz = clamp(desiredAz, lim.minAz, lim.maxAz);
    const desiredEl = clamp(this.#targetElevation, lim.minEl, lim.maxEl);

    // Velvety Spline-like inertia for orbit, zoom & pan
    const orbitLambda = 7.2;
    if (dt > 0) {
      this.#azimuth = damp(this.#azimuth, desiredAz, orbitLambda, dt);
      this.#elevation = damp(this.#elevation, desiredEl, orbitLambda, dt);
      this.#zoom = damp(this.#zoom, this.#targetZoom, orbitLambda, dt);
      this.#panY = damp(this.#panY, this.#targetPanY, orbitLambda, dt);
      this.#panZ = damp(this.#panZ, this.#targetPanZ, orbitLambda, dt);
    } else {
      this.#azimuth = desiredAz;
      this.#elevation = desiredEl;
      this.#zoom = this.#targetZoom;
      this.#panY = this.#targetPanY;
      this.#panZ = this.#targetPanZ;
    }

    // Subtle idle breathing sway
    const swayAz = Math.sin(time * 0.4) * 0.004 * swayAmount;
    const swayEl = Math.cos(time * 0.3) * 0.003 * swayAmount;

    // While the angle and the zoom ease in, the camera may not back out past the near edge either
    if (this.#followTaxi) {
      this.#zoom = Math.min(this.#zoom, maxZoomFor(this.#azimuth, this.#elevation, baseRadius, 1.75));
    }
    const radius = baseRadius * this.#zoom;
    const az = clamp(this.#azimuth + swayAz, lim.minAz, lim.maxAz);
    const el = clamp(this.#elevation + swayEl, lim.minEl, lim.maxEl);

    // Low-angle perspective lift
    const lowBlend = lowBlendOf(el);
    const lowAngleLookLift = 6.0 * lowBlend;

    const baseFov = this.#store.get('camera.fov') ?? 18;
    const effectiveFov = baseFov + 14.5 * lowBlend;
    if (Math.abs(this.#camera.fov - effectiveFov) > 0.01) {
      this.#camera.fov = effectiveFov;
      this.#camera.updateProjectionMatrix();
    }

    // Anchor point: smoothly follows the taxi, or stays where `teleportTo` put it
    const desiredAnchorX = mode === 'Chase' ? targetX + 0.95 : 1.75;
    const desiredOrbitY = targetY + 1.12 + this.#panY;
    const desiredAnchorY = desiredOrbitY + lowAngleLookLift;

    let desiredAnchorZ;
    if (this.#followTaxi) {
      desiredAnchorZ = targetZ + (mode === 'Chase' ? 1.8 : 0.6) + this.#panZ;
      this.#freeAnchorZ = desiredAnchorZ;
    } else {
      desiredAnchorZ = this.#freeAnchorZ + this.#panZ;
    }

    if (dt > 0) {
      this.#anchorX = damp(this.#anchorX, desiredAnchorX, smoothing, dt);
      this.#orbitY = damp(this.#orbitY, desiredOrbitY, smoothing, dt);
      this.#anchorY = damp(this.#anchorY, desiredAnchorY, smoothing, dt);
      this.#anchorZ = damp(this.#anchorZ, desiredAnchorZ, smoothing * 1.6, dt);
    } else {
      this.#anchorX = desiredAnchorX;
      this.#orbitY = desiredOrbitY;
      this.#anchorY = desiredAnchorY;
      this.#anchorZ = desiredAnchorZ;
    }

    let r = radius;
    this.#place(az, el, r);
    // The frame's lower corners must meet the ground short of the near edge too (a wide frame
    // turned aside looks past the camera's own X): move in until they do
    if (this.#followTaxi) {
      for (let i = 0; i < 16 && this.#seesPastNearEdge(); i++) {
        r *= 0.94;
        this.#place(az, el, r);
      }
      this.#zoom = Math.min(this.#zoom, r / baseRadius);
    }
  }

  #place(az, el, radius) {
    const horizR = Math.cos(el) * radius;
    const camX = this.#anchorX + Math.cos(az) * horizR;
    const camY = Math.max(0.4, this.#orbitY + Math.sin(el) * radius);
    const camZ = this.#anchorZ + Math.sin(az) * horizR;
    this.#camera.position.set(camX, camY, camZ);
    this.#camera.lookAt(this.#anchorX, this.#anchorY, this.#anchorZ);
    this.#camera.updateMatrixWorld();
  }

  /** Does a ray through the frame's lower half meet flat ground past `NEAR_EDGE_X`? */
  #seesPastNearEdge() {
    const cam = this.#camera;
    for (const [nx, ny] of FRAME_PROBES) {
      _ray.set(nx, ny, 0.5).unproject(cam).sub(cam.position);
      if (_ray.y >= 0) continue;
      const x = cam.position.x + (_ray.x * (cam.position.y - 0.15)) / -_ray.y;
      if (x < NEAR_EDGE_X + 0.5) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Presets & Interactive Pointer / Wheel / Touch Controls
  // -------------------------------------------------------------------------

  /** The viewer's limits while following the taxi, the wide scripted ones after `teleportTo`. */
  #limits() {
    const L = CAMERA_LIMITS;
    const el = clamp(this.#targetElevation, L.minElevation, L.maxElevation);
    const span = azimuthSpanFor(el, this.#camera.aspect, this.#store.get('camera.fov') ?? 26);
    return this.#followTaxi
      ? {
          minAz: Math.max(L.minAzimuth, -Math.PI - span),
          maxAz: Math.min(L.maxAzimuth, -Math.PI + span),
          minEl: L.minElevation,
          maxEl: L.maxElevation,
          minZoom: L.minZoom,
        }
      : {
          minAz: MIN_AZIMUTH,
          maxAz: MAX_AZIMUTH,
          minEl: BASE_MIN_ELEVATION,
          maxEl: MAX_ELEVATION,
          minZoom: MIN_ZOOM,
        };
  }

  #syncElevationFromStore() {
    const baseDist = this.#store.get('camera.distance') ?? 16.2;
    const baseHeight = this.#store.get('camera.height') ?? 10.6;
    const lim = this.#limits();
    this.#targetElevation = clamp(Math.atan2(baseHeight - 0.85, baseDist * 1.018), lim.minEl, lim.maxEl);
  }

  #applyModePreset(mode) {
    switch (mode) {
      case 'Chase':
        this.#targetAzimuth = -2.26; // rear-3/4 isometric down the street
        this.#targetElevation = 0.45;
        break;
      case 'Side': {
        this.#targetAzimuth = -Math.PI; // pure 00:01 reference side-elevation profile!
        const customHeight = this.#store.get('camera.height');
        if (typeof customHeight === 'number' && Math.abs(customHeight - 10.6) > 0.05) {
          this.#syncElevationFromStore();
        } else {
          this.#targetElevation = 0.30;
        }
        break;
      }
      case 'Orbit':
      case 'Isometric':
      default:
        this.#targetAzimuth = DEFAULT_AZIMUTH;
        this.#syncElevationFromStore();
        break;
    }
  }

  #bindControls(el) {
    const onContextMenu = (e) => e.preventDefault();

    const onPointerDown = (e) => {
      // Ignore clicks on UI overlays if any bubble up
      if (e.target !== el) return;
      el.setPointerCapture?.(e.pointerId);
      this.#activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.#activePointers.size === 2) {
        this.#dragMode = 'pinch';
        this.#lastPinchDist = this.#getPinchDistance();
      } else if (this.#activePointers.size === 1) {
        this.#dragMode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
        this.#lastX = e.clientX;
        this.#lastY = e.clientY;
        el.classList.add('is-dragging');
      }
    };

    const onPointerMove = (e) => {
      if (!this.#activePointers.has(e.pointerId)) return;
      this.#activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.#dragMode === 'pinch' && this.#activePointers.size === 2) {
        const dist = this.#getPinchDistance();
        if (this.#lastPinchDist > 0 && dist > 0) {
          const ratio = this.#lastPinchDist / dist;
          this.#targetZoom = clamp(this.#targetZoom * ratio, MIN_ZOOM, MAX_ZOOM);
        }
        this.#lastPinchDist = dist;
        return;
      }

      if (this.#activePointers.size !== 1) return;

      const dx = e.clientX - this.#lastX;
      const dy = e.clientY - this.#lastY;
      this.#lastX = e.clientX;
      this.#lastY = e.clientY;

      const vw = Math.max(320, el.clientWidth || window.innerWidth);
      const vh = Math.max(320, el.clientHeight || window.innerHeight);

      if (this.#dragMode === 'orbit') {
        const orbitSpeed = 2.15;
        const lim = this.#limits();
        this.#targetAzimuth = cushionedStep(
          this.#targetAzimuth,
          (dx / vw) * orbitSpeed,
          lim.minAz,
          lim.maxAz,
        );
        this.#targetElevation = cushionedStep(
          this.#targetElevation,
          (dy / vh) * 1.35,
          lim.minEl,
          lim.maxEl,
        );
      } else if (this.#dragMode === 'pan') {
        // Up and down only: the camera stays on the taxi
        const panScale = 18.0 * this.#zoom;
        this.#targetPanY = clamp(this.#targetPanY + (dy / vh) * panScale * 0.75, -0.8, 16.0);
      }
    };

    const onPointerEnd = (e) => {
      if (!this.#activePointers.has(e.pointerId)) return;
      this.#activePointers.delete(e.pointerId);
      el.releasePointerCapture?.(e.pointerId);

      if (this.#activePointers.size === 1) {
        const remaining = this.#activePointers.values().next().value;
        this.#dragMode = 'orbit';
        this.#lastX = remaining.x;
        this.#lastY = remaining.y;
      } else if (this.#activePointers.size === 0) {
        this.#dragMode = null;
        el.classList.remove('is-dragging');
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const delta = clamp(e.deltaY, -120, 120);
      const factor = Math.exp(delta * 0.0016);
      this.#targetZoom = clamp(this.#targetZoom * factor, MIN_ZOOM, MAX_ZOOM);
    };

    const onDblClick = () => {
      this.resetView();
    };

    const onKeyDown = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
        return;
      }
      if (e.code === 'KeyR') {
        e.preventDefault();
        this.resetView();
        return;
      }

      this.#keysDown.add(e.code);
    };

    const onKeyUp = (e) => {
      this.#keysDown.delete(e.code);
    };

    const onBlur = () => {
      this.#keysDown.clear();
    };

    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    this.#cleanupFns.push(() => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });
  }

  #getPinchDistance() {
    const pts = Array.from(this.#activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  }

  dispose() {
    for (let i = this.#cleanupFns.length - 1; i >= 0; i--) {
      this.#cleanupFns[i]?.();
    }
    this.#cleanupFns.length = 0;
  }
}
