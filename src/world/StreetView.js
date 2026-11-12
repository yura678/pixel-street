/**
 * Infinite Procedural Street View & Chunk Streamer.
 *
 * Streams 20 m street chunks (`StreetLayout` -> `BuildingFactory`) ahead of and behind the taxi,
 * sharing a single `StreetAtlasMaterial` and `LightPoolMaterial` across all active chunks (and a
 * second atlas material for the near sidewalk, whose crowns are dithered).
 * The street is a loop of `TOTAL_LOOP_CHUNKS` chunks, so a chunk's geometry depends only on
 * its place in the loop: each of the 12 is built once (all of them up front) and every lap
 * reuses it, placed at the chunk's own Z. Nothing is built while the taxi drives; the cache is
 * rebuilt only on `regenerate()` (seed, density, colours) and freed on `dispose()`.
 */
import * as THREE from 'three/webgpu';
import { System } from '../core/System.js';
import { Events } from '../core/EventBus.js';
import { CHUNKS_BEHIND, CHUNK_LENGTH } from '../config/constants.js';
import { LotType, StreetLayout, TOTAL_LOOP_CHUNKS } from '../simulation/street/StreetLayout.js';
import { createLightPoolMaterial, createStreetAtlasMaterial } from './AtlasMaterial.js';
import { BuildingFactory } from './BuildingFactory.js';

export const REGEN_KEYS = new Set([
  'street.seed',
  'street.treeDensity',
  'street.saturation',
  'leaves.colorA',
  'leaves.colorB',
  'taxi.busStopInterval',
]);

/**
 * Reverses the draw order of a geometry's triangles, in place. A chunk is built mass first and
 * detail after (walls, then the windows, sills, cornices and signs on them), so drawn as built
 * every detail pixel is shaded twice: once on the wall behind it, again on itself. Drawn the
 * other way round, the depth test rejects the wall's pixels behind the details before they are
 * shaded – ~6.6 ms of a 51 ms frame on an integrated Intel UHD at 1600 × 900. The builders and
 * the geometry checks keep the built order; only what the GPU draws is reversed.
 * @param {THREE.BufferGeometry | null} geometry
 */
export function reverseTriangles(geometry) {
  const a = geometry?.index?.array;
  if (!a) return;
  const n = a.length / 3;
  for (let i = 0, j = n - 1; i < j; i++, j--) {
    for (let k = 0; k < 3; k++) {
      const t = a[i * 3 + k];
      a[i * 3 + k] = a[j * 3 + k];
      a[j * 3 + k] = t;
    }
  }
}

export class StreetView extends System {
  /** @type {THREE.Scene} */
  #scene;
  /** @type {import('../core/Store.js').Store} */
  #store;
  /** @type {import('../core/EventBus.js').EventBus | null} */
  #bus;
  /** @type {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} */
  #uniforms;

  /** @type {BuildingFactory} */
  #factory;
  /** @type {THREE.MeshStandardNodeMaterial} */
  #solidMaterial;
  /**
   * The near sidewalk's material: its crowns dithered between the camera and the street.
   * @type {THREE.MeshStandardNodeMaterial}
   */
  #nearMaterial;
  /** @type {THREE.MeshBasicNodeMaterial} */
  #poolMaterial;
  /** @type {THREE.Group} */
  #group;

  /**
   * Active streamed chunks indexed by `chunkIndex`.
   * @type {Map<number, {
   *   chunkIndex: number,
   *   layout: object,
   *   group: THREE.Group,
   *   poolMesh: THREE.Mesh | null,
   *   busStopZ: number | null,
   *   trees: object[]
   * }>}
   */
  #chunks = new Map();

  /**
   * Built geometry of each loop chunk (`0 … TOTAL_LOOP_CHUNKS − 1`), shared by every lap.
   * `trees` in the loop chunk's own world Z (shift them by whole laps).
   * @type {Map<number, {
   *   solidGeo: THREE.BufferGeometry | null,
   *   poolGeo: THREE.BufferGeometry | null,
   *   nearGeo: THREE.BufferGeometry | null,
   *   trees: object[]
   * }>}
   */
  #loop = new Map();
  /** How many chunks the factory has built (for tests and the debug overlay). */
  #buildCount = 0;

  /** Trees of the streamed chunks (`trees`), null when the chunks changed. @type {object[] | null} */
  #trees = null;
  #dirty = false;
  #lastMinChunk = null;
  #lastMaxChunk = null;
  #cameraZ = null;

  /**
   * @param {THREE.Scene} scene
   * @param {import('../core/Store.js').Store} store
   * @param {import('../rendering/uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {ReturnType<import('../textures/PixelCanvas.js').createFacadeAtlas>} atlas
   * @param {import('../core/EventBus.js').EventBus} [bus]
   */
  constructor(scene, store, uniforms, atlas, bus = null) {
    super('street');
    this.#scene = scene;
    this.#store = store;
    this.#uniforms = uniforms;
    this.#bus = bus;

    this.#factory = new BuildingFactory(atlas);
    this.#solidMaterial = this.track(createStreetAtlasMaterial(atlas, uniforms));
    this.#nearMaterial = this.track(createStreetAtlasMaterial(atlas, uniforms, { canopy: true }));
    this.#poolMaterial = this.track(createLightPoolMaterial(uniforms));

    this.#group = new THREE.Group();
    this.#group.name = 'StreetView';
    this.#scene.add(this.#group);

    this.track(() => {
      this.#clearAllChunks();
      this.#clearLoop();
      this.#scene.remove(this.#group);
    });

    this.#bindEvents();

    // Populate initial chunks around z = 0 immediately, then the rest of the loop
    this.syncChunks(0);
    this.#warmLoop();
  }

  get group() {
    return this.#group;
  }

  get activeChunkCount() {
    return this.#chunks.size;
  }

  /** Chunks the factory has built since start (12 per `regenerate()`, none while driving). */
  get buildCount() {
    return this.#buildCount;
  }

  /**
   * The street trees of every streamed chunk, both sidewalks (world X and Z, crown Y up from
   * the sidewalk): where the falling leaves grow. Rebuilt only when the chunks change.
   * @returns {ReadonlyArray<{ x: number, z: number, crown: { x: number, y: number, z: number,
   *   rx: number, ry: number, rz: number } }>}
   */
  get trees() {
    if (!this.#trees) {
      this.#trees = [];
      for (const entry of this.#chunks.values()) this.#trees.push(...entry.trees);
    }
    return this.#trees;
  }

  /**
   * Set active camera Z focus point so chunks around the camera are always kept loaded.
   * @param {number} z
   */
  setCameraZ(z) {
    this.#cameraZ = z;
  }

  /**
   * Frame update: stream chunks as taxi advances or camera moves.
   * @param {number} _dt
   */
  update(_dt) {
    const taxiZ = this.#uniforms.taxiPosition.value.z;
    if (this.#dirty) {
      this.#dirty = false;
      this.regenerate(taxiZ);
    } else {
      this.syncChunks(taxiZ, this.#cameraZ ?? taxiZ);
    }
  }

  /**
   * Ensures all chunks between camera and taxi exist within draw distance
   * and disposes chunks outside that window.
   * @param {number} [centerZ]
   * @param {number} [secondaryZ]
   */
  syncChunks(centerZ = this.#uniforms.taxiPosition.value.z, secondaryZ = this.#cameraZ ?? centerZ) {
    const c1 = Math.floor(centerZ / CHUNK_LENGTH);
    const c2 = Math.floor(secondaryZ / CHUNK_LENGTH);
    const drawChunks = Math.max(3, this.#store.get('street.drawChunks') ?? 7);
    const minChunk = Math.min(c1, c2) - CHUNKS_BEHIND;
    const maxChunk = Math.max(c1, c2) + drawChunks;

    if (
      this.#lastMinChunk === minChunk &&
      this.#lastMaxChunk === maxChunk &&
      this.#chunks.has(minChunk) &&
      this.#chunks.has(maxChunk)
    ) {
      return;
    }
    this.#lastMinChunk = minChunk;
    this.#lastMaxChunk = maxChunk;

    // 1. Prune chunks outside active window
    for (const [idx, entry] of this.#chunks) {
      if (idx < minChunk || idx > maxChunk) {
        this.#disposeChunkEntry(entry);
        this.#chunks.delete(idx);
      }
    }

    // 2. Build missing chunks in order from near to far
    for (let idx = minChunk; idx <= maxChunk; idx++) {
      if (!this.#chunks.has(idx)) {
        this.#spawnChunk(idx);
      }
    }
  }

  /**
   * Disposes all active chunks and rebuilds around `centerZ` (e.g. when seed or weights change).
   * @param {number} [centerZ=0]
   */
  regenerate(centerZ = this.#uniforms.taxiPosition.value.z) {
    this.#clearAllChunks();
    this.#clearLoop();
    this.#lastMinChunk = null;
    this.#lastMaxChunk = null;
    this.syncChunks(centerZ, this.#cameraZ ?? centerZ);
    this.#warmLoop();
  }

  /**
   * Returns the world `Z` of the next upcoming bus stop strictly ahead of `afterZ`.
   * Searches active chunks first, then queries `StreetLayout` up to 36 chunks ahead.
   *
   * @param {number} afterZ
   * @returns {number} world Z of next bus stop, or `Infinity` if none
   */
  findNextBusStopZ(afterZ) {
    const startChunk = Math.max(0, Math.floor(afterZ / CHUNK_LENGTH));
    const maxLookahead = startChunk + 36;

    for (let idx = startChunk; idx <= maxLookahead; idx++) {
      const cached = this.#chunks.get(idx);
      if (cached) {
        if (cached.busStopZ !== null && cached.busStopZ > afterZ + 0.35) {
          return cached.busStopZ;
        }
        continue;
      }

      const layout = StreetLayout.getChunk(idx, this.#store);
      for (let i = 0; i < layout.right.length; i++) {
        const lot = layout.right[i];
        if (lot.type === LotType.BUS_STOP && lot.centerZ > afterZ + 0.35) {
          return lot.centerZ;
        }
      }
    }

    return Infinity;
  }

  // -------------------------------------------------------------------------
  // Internal chunk lifecycle
  // -------------------------------------------------------------------------

  /**
   * The geometry of loop chunk `cycle`, built on first use.
   * @param {number} cycle `0 … TOTAL_LOOP_CHUNKS − 1`
   */
  #loopChunk(cycle) {
    let built = this.#loop.get(cycle);
    if (!built) {
      const layout = StreetLayout.getChunk(cycle, this.#store);
      const { solidGeometry, lightPoolGeometry, nearGeometry, trees } = this.#factory.buildChunk(
        layout,
        this.#store,
      );
      reverseTriangles(solidGeometry);
      reverseTriangles(nearGeometry);
      built = { solidGeo: solidGeometry, poolGeo: lightPoolGeometry, nearGeo: nearGeometry, trees };
      this.#loop.set(cycle, built);
      this.#buildCount++;
    }
    return built;
  }

  /** Builds every loop chunk not built yet, so no chunk is built while driving. */
  #warmLoop() {
    for (let cycle = 0; cycle < TOTAL_LOOP_CHUNKS; cycle++) this.#loopChunk(cycle);
  }

  #clearLoop() {
    for (const built of this.#loop.values()) {
      built.solidGeo?.dispose();
      built.poolGeo?.dispose();
      built.nearGeo?.dispose();
    }
    this.#loop.clear();
  }

  #spawnChunk(chunkIndex) {
    const layout = StreetLayout.getChunk(chunkIndex, this.#store);
    const cycle = ((chunkIndex % TOTAL_LOOP_CHUNKS) + TOTAL_LOOP_CHUNKS) % TOTAL_LOOP_CHUNKS;
    const shift = (chunkIndex - cycle) * CHUNK_LENGTH;
    const built = this.#loopChunk(cycle);
    const solidGeometry = built.solidGeo;
    const lightPoolGeometry = built.poolGeo;
    const nearGeometry = built.nearGeo;
    const trees =
      shift === 0
        ? built.trees
        : built.trees.map((t) => ({
            ...t,
            z: t.z + shift,
            crown: { ...t.crown, z: t.crown.z + shift },
          }));

    const chunkGroup = new THREE.Group();
    chunkGroup.name = `StreetChunk_${chunkIndex}`;
    chunkGroup.position.set(0, 0, layout.zStart);

    if (solidGeometry) {
      const solidMesh = new THREE.Mesh(solidGeometry, this.#solidMaterial);
      solidMesh.castShadow = true;
      solidMesh.receiveShadow = true;
      chunkGroup.add(solidMesh);
    }

    if (nearGeometry) {
      const nearMesh = new THREE.Mesh(nearGeometry, this.#nearMaterial);
      nearMesh.castShadow = true;
      nearMesh.receiveShadow = true;
      chunkGroup.add(nearMesh);
    }

    let poolMesh = null;
    if (lightPoolGeometry) {
      poolMesh = new THREE.Mesh(lightPoolGeometry, this.#poolMaterial);
      poolMesh.renderOrder = 2;
      chunkGroup.add(poolMesh);
    }

    let busStopZ = null;
    for (let i = 0; i < layout.right.length; i++) {
      if (layout.right[i].type === LotType.BUS_STOP) {
        busStopZ = layout.right[i].centerZ;
        break;
      }
    }

    this.#group.add(chunkGroup);
    this.#chunks.set(chunkIndex, {
      chunkIndex,
      layout,
      group: chunkGroup,
      poolMesh,
      busStopZ,
      trees,
    });
    this.#trees = null;
  }

  /** Takes a chunk off the street; its geometry stays in the loop cache. */
  #disposeChunkEntry(entry) {
    this.#trees = null;
    this.#group.remove(entry.group);
  }

  #clearAllChunks() {
    for (const entry of this.#chunks.values()) {
      this.#disposeChunkEntry(entry);
    }
    this.#chunks.clear();
  }

  #bindEvents() {
    this.track(
      this.#store.subscribe('*', (keys) => {
        for (let i = 0; i < keys.length; i++) {
          if (REGEN_KEYS.has(keys[i])) {
            this.#dirty = true;
            break;
          }
          if (keys[i] === 'street.drawChunks') {
            this.#lastMinChunk = null;
            this.#lastMaxChunk = null;
          }
        }
      }),
    );

    if (this.#bus) {
      this.track(
        this.#bus.on(Events.STREET_REGENERATE, () => {
          this.#dirty = true;
        }),
      );
    }
  }
}
