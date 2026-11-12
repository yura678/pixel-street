/**
 * Application Composition Root.
 * Wires the core Store/EventBus, WebGPU rendering pipeline, weather & taxi simulation,
 * procedural pixel-art atlas, wet road, streaming street architecture, and 3D taxi diorama.
 */
import * as THREE from 'three/webgpu';
import { Store } from '../core/Store.js';
import { EventBus, Events } from '../core/EventBus.js';
import { System } from '../core/System.js';
import { hexToRgb, lerpHex } from '../core/color.js';
import { degToRad } from '../core/math.js';
import { CHUNK_LENGTH } from '../config/constants.js';
import { PARAM_DEFS } from '../config/params.schema.js';
import { bindWeatherPresets } from './presetBinding.js';
import { applyUrlParams } from './urlParams.js';
import { Renderer } from '../rendering/Renderer.js';
import { WorldUniforms } from '../rendering/uniforms/WorldUniforms.js';
import { CameraRig } from '../rendering/CameraRig.js';
import { Lighting } from '../rendering/Lighting.js';
import { PixelPipeline } from '../rendering/PixelPipeline.js';
import { QualityGovernor, browserEnv, detectTier, tierOf } from '../rendering/QualityGovernor.js';
import { skyFogNode } from '../rendering/tsl/sky.js';
import { WeatherState } from '../simulation/weather/WeatherState.js';
import { TaxiStateMachine } from '../simulation/taxi/TaxiStateMachine.js';
import { PuddleField } from '../simulation/puddles/PuddleField.js';
import { TireWetness } from '../simulation/tracks/TireWetness.js';
import { createFacadeAtlas } from '../textures/PixelCanvas.js';
import { RoadView } from '../world/RoadView.js';
import { StreetProfileView } from '../world/StreetProfileView.js';
import { StreetView } from '../world/StreetView.js';
import { PartsShowcase } from '../world/PartsShowcase.js';
import { SkyView } from '../world/SkyView.js';
import { TaxiView } from '../vehicles/TaxiView.js';
import { WaterSystem } from '../systems/WaterSystem.js';
import { FxSystem } from '../systems/FxSystem.js';
import { FpsMeter } from '../ui/FpsMeter.js';
import { Forge } from '../ui/forge/Forge.js';
import { PresetLibrary, browserStorage } from '../ui/forge/presetStorage.js';
import { fileSlug } from '../ui/forge/forgeModel.js';
import { downloadBlob } from '../ui/download.js';
import { GameLoop } from './GameLoop.js';

const _rgb = { r: 0, g: 0, b: 0 };

export class App {
  /** @type {Store} */
  store;
  /** @type {EventBus} */
  bus;
  /** @type {Renderer} */
  renderer;
  /** @type {WorldUniforms} */
  uniforms;
  /** @type {THREE.Scene} */
  scene;
  /** @type {CameraRig} */
  cameraRig;
  /** @type {Lighting} */
  lighting;
  /** @type {PixelPipeline} */
  pipeline;

  // Simulation
  /** @type {WeatherState} */
  weather;
  /** @type {TaxiStateMachine} */
  taxi;
  /** @type {PuddleField} */
  puddles;
  /** @type {TireWetness} */
  tireWetness;

  // 3D Views & Procedural Textures
  /** @type {ReturnType<typeof createFacadeAtlas>} */
  atlas;
  /** @type {RoadView} */
  roadView;
  /** @type {StreetProfileView} */
  streetProfile;
  /** @type {StreetView} */
  streetView;
  /** @type {SkyView} */
  skyView;
  /** @type {TaxiView} */
  taxiView;
  /** @type {WaterSystem} */
  water;
  /** @type {FxSystem} */
  fx;
  /** @type {PartsShowcase | undefined} */
  partsShowcase;

  /** @type {GameLoop} */
  loop;
  /** @type {FpsMeter} */
  fpsMeter;
  /** @type {Forge | null} the side panel; null with `?forge=0` */
  forge = null;
  /** @type {'low' | 'medium' | 'high'} the device's quality tier (detected, or `?quality=`) */
  tierName = 'high';
  /** @type {QualityGovernor} */
  governor;

  isPaused = false;

  #lightningFlash = 0;
  /** Forge asked for a screenshot: saved right after the next frame is drawn. */
  #screenshotPending = false;

  togglePause() {
    this.isPaused = !this.isPaused;
    this.cameraRig.isPaused = this.isPaused;
    return this.isPaused;
  }

  async start() {
    // 1. Core data state
    this.store = new Store(PARAM_DEFS);
    this.bus = new EventBus();

    // 2. Preset binding & URL overrides
    bindWeatherPresets(this.store, this.bus);
    const urlConfig = applyUrlParams(this.store, window.location.search);

    // Device quality tier: MSAA, the shadows' default, the pixel-ratio cap, the most leaves and
    // the governor's first rung. Shadows and MSAA stay put at runtime (switching them recompiles
    // every material), so the tier decides them now.
    this.tierName = urlConfig.quality ?? detectTier(browserEnv());
    const tier = tierOf(this.tierName);
    if (!tier.shadows && !('render.shadows' in urlConfig.values)) {
      this.store.set('render.shadows', false, 'tier');
    }

    // 3. Renderer & WebGPU Initialization
    const canvas = document.getElementById('view');
    if (!canvas) throw new Error('Canvas element #view not found');

    const bench = urlConfig.bench;
    this.renderer = new Renderer(canvas, this.store, { maxDpr: tier.maxDpr });
    await this.renderer.init();

    // 4. Uniforms, Scene, Atmospheric Fog, Camera & Lighting
    this.uniforms = new WorldUniforms(this.store);
    this.scene = new THREE.Scene();

    const initialSkyHex = lerpHex(
      this.store.get('lighting.horizon') ?? '#bfe2ff',
      this.store.get('lighting.zenith') ?? '#3f86dd',
      0.42,
    );
    this.scene.background = new THREE.Color(initialSkyHex);
    // Exponential-squared fog the colour of the sky behind each fragment
    if (!bench.has('nofog')) this.scene.fogNode = skyFogNode(this.uniforms);
    if (bench.has('flat')) this.scene.overrideMaterial = new THREE.MeshBasicNodeMaterial();

    this.cameraRig = new CameraRig(this.store, canvas);
    this.cameraRig.onTogglePause = () => this.togglePause();
    this.lighting = new Lighting(this.scene, this.store);

    // 5. Post-processing Pixel Pipeline
    this.pipeline = new PixelPipeline(
      this.renderer.webgpuRenderer,
      this.scene,
      this.cameraRig.camera,
      this.uniforms,
      { samples: bench.has('msaa0') ? 0 : tier.msaa, bench },
    );

    // 6. Simulation Layer
    this.weather = new WeatherState(this.store, this.bus);
    const cruiseSpeed = this.store.get('taxi.cruiseSpeed') ?? 8.0;
    this.taxi = new TaxiStateMachine(this.store, this.bus, {
      initialZ: 0,
      initialSpeed: cruiseSpeed * 0.65,
    });
    this.puddles = new PuddleField(this.store, this.bus);
    this.tireWetness = new TireWetness(this.bus);

    this.bus.on(Events.LIGHTNING, ({ intensity = 1.0 } = {}) => {
      this.#lightningFlash = Math.min(2.0, intensity);
    });

    // 7. Procedural Pixel-Art Textures & 3D Diorama Views
    this.atlas = createFacadeAtlas(3);
    this.roadView = new RoadView(this.scene, this.store, this.uniforms);
    this.streetProfile = new StreetProfileView(this.scene, this.store, this.uniforms, this.bus);
    this.streetView = new StreetView(this.scene, this.store, this.uniforms, this.atlas, this.bus);
    this.skyView = new SkyView(this.scene, this.uniforms, this.cameraRig.camera);
    this.taxiView = new TaxiView(this.scene, this.store, this.uniforms, this.atlas, this.taxi);
    this.water = new WaterSystem({
      scene: this.scene,
      store: this.store,
      bus: this.bus,
      uniforms: this.uniforms,
      camera: this.cameraRig.camera,
      puddleField: this.puddles,
      tireWetness: this.tireWetness,
      taxi: this.taxi,
      taxiRoot: this.taxiView.root,
    });

    this.fx = new FxSystem({
      scene: this.scene,
      store: this.store,
      uniforms: this.uniforms,
      renderer: this.renderer.webgpuRenderer,
      cameraRig: this.cameraRig,
      streetView: this.streetView,
      leafCap: tier.leaves,
    });

    // Adaptive quality: the governor walks the ladder by the frame time (`render.autoQuality`)
    this.governor = new QualityGovernor({
      level: this.store.get('render.autoQuality') ? tier.startLevel : 0,
      targetFps: this.store.get('render.targetFps'),
    });
    this.#applyQuality('start');
    this.store.subscribe(['render.autoQuality', 'render.targetFps'], (keys) => {
      const now = performance.now();
      this.governor.setTarget(this.store.get('render.targetFps'));
      if (keys.includes('render.autoQuality') && !this.store.get('render.autoQuality')) {
        this.governor.setLevel(0, now); // manual: the full rung
        this.#applyQuality('manual');
      } else {
        this.governor.reset(now);
      }
    });

    // `?debug=parts`: the architectural parts on stands instead of the houses
    if (urlConfig.parts) {
      this.partsShowcase = new PartsShowcase(this.scene, this.atlas, this.uniforms);
      this.streetView.group.visible = false;
    }

    // Schedule first upcoming bus stop for the taxi
    this.taxi.setNextBusStop(this.streetView.findNextBusStopZ(this.taxi.z));

    this.store.subscribe('*', (keys) => {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (
          k === 'street.seed' ||
          k === 'taxi.busStopInterval' ||
          k === 'water.puddleCount' ||
          k === 'water.puddleSize'
        ) {
          this.puddles.pruneBehind(Infinity, 0);
          this.taxi.setNextBusStop(this.streetView.findNextBusStopZ(this.taxi.z));
          break;
        }
      }
    });

    // 8. FPS Meter, Camera HUD & Ordered Game Loop
    this.fpsMeter = new FpsMeter(this.store, {
      extra: () =>
        `${this.streetView.activeChunkCount} chunks  ${this.taxi.state}\n` +
        `quality ${this.tierName} · ${this.governor.rung.label}` +
        (this.store.get('render.autoQuality') ? '' : ' (fixed)'),
    });

    // Forge side panel (hidden with `?forge=0`; `?forge=1` opens it even on a phone)
    if (urlConfig.forge !== false) {
      this.forge = new Forge({
        store: this.store,
        bus: this.bus,
        library: new PresetLibrary(browserStorage()),
        ...(urlConfig.forge ? { collapsed: false } : {}),
      });
    }
    this.bus.on(Events.FORGE_ACTION, ({ id }) => {
      if (id === 'screenshot') this.#screenshotPending = true;
    });

    this.loop = new GameLoop({
      render: (dt, frame) => {
        this.cameraRig.update(dt, frame.time, this.taxi.x, 0, this.taxi.z);
        this.streetView.setCameraZ(this.cameraRig.anchorZ);
        this.water.setCameraZ(this.cameraRig.anchorZ);
        this.skyView.update();
        this.lighting.updateSunPosition(this.cameraRig.anchorZ);
        this.lighting.syncCascades(this.cameraRig.camera);

        this.pipeline.render();
        if (this.#screenshotPending) this.#saveScreenshot();
      },
      onFrame: (rawDt) => {
        this.fpsMeter.sample(rawDt);
        this.#sampleQuality(rawDt);
      },
    });

    // Register systems in simulation -> world -> vehicle order
    const simSystem = new System('simulation');
    simSystem.update = (dt, frame) => this.#updateSimulation(dt, frame);

    this.loop.add(simSystem);
    this.loop.add(this.roadView);
    this.loop.add(this.streetProfile);
    this.loop.add(this.streetView);
    this.loop.add(this.taxiView);
    this.loop.add(this.water);
    this.loop.add(this.fx);

    // Prime initial camera & world state at t = 0 before first frame
    this.cameraRig.update(0, 0, this.taxi.x, 0, this.taxi.z);
    this.uniforms.update(0, this.taxi.x, 0, this.taxi.z, this.taxi.speed);
    this.taxiView.update(0, { time: 0, frame: 0, rawDt: 0 });

    // Pause / reset clock on tab switch
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.loop.resetClock();
        this.governor.reset(performance.now());
      }
    });

    // 9. Debug API (dev mode or ?debug)
    if (import.meta.env.DEV || urlConfig.debug) {
      window.__street = {
        app: this,
        store: this.store,
        bus: this.bus,
        scene: this.scene,
        renderer: this.renderer,
        cameraRig: this.cameraRig,
        weather: this.weather,
        taxi: this.taxi,
        roadView: this.roadView,
        streetProfile: this.streetProfile,
        streetView: this.streetView,
        taxiView: this.taxiView,
        water: this.water,
        fx: this.fx,
        forge: this.forge,
        governor: this.governor,
        puddles: this.puddles,
        partsShowcase: this.partsShowcase ?? null,
      };
    }

    // 10. Start the WebGPU animation loop
    this.renderer.webgpuRenderer.setAnimationLoop(this.loop.tick);
  }

  /**
   * Advances weather, bus-stop scheduling, taxi kinematics, puddle splash checks & shared uniforms.
   * @param {number} dt
   * @param {import('../core/System.js').FrameInfo} frame
   */
  #updateSimulation(dt, frame) {
    // 1. Continuous weather transitions & lightning decay
    this.weather.update(dt);
    if (this.#lightningFlash > 0) {
      this.#lightningFlash = Math.max(0, this.#lightningFlash - dt * 6.5);
    }

    this.#syncWeatherToVisuals();

    // 2. Keep taxi informed of the next bus stop ahead
    if (!Number.isFinite(this.taxi.nextBusStop) || this.taxi.z > this.taxi.nextBusStop + 0.4) {
      this.taxi.setNextBusStop(this.streetView.findNextBusStopZ(this.taxi.z));
    }

    // 3. Advance taxi motion, wheel puddle collisions & tire drying (freeze if paused)
    const simDt = this.isPaused ? 0 : dt;
    this.taxi.update(simDt);
    if (!this.isPaused) {
      this.puddles.checkWheelContacts(
        this.taxi.x,
        this.taxi.z,
        this.taxi.speed,
        this.weather.puddleLevel,
      );
      this.puddles.pruneBehind(Math.floor(this.taxi.z / CHUNK_LENGTH));
      this.tireWetness.update(simDt, this.taxi.speed, this.weather.wetness);
    }

    // 4. Push frame state to shared TSL uniforms
    this.uniforms.update(frame.time, this.taxi.x, 0, this.taxi.z, this.taxi.speed);
  }

  #syncWeatherToVisuals() {
    const w = this.weather;
    const u = this.uniforms;
    const flash = this.#lightningFlash;

    u.wetness.value = w.wetness;
    u.rainIntensity.value = w.rain;
    u.puddleLevel.value = w.puddleLevel;
    u.fogDensity.value = w.fog;
    u.windStrength.value = w.windStrength;
    u.windDirection.value = degToRad(w.windDir);
    u.streetLights.value = w.streetLights;
    u.windowLights.value = w.windowLights;
    u.sunIntensity.value = w.sunIntensity + flash * 4.5;
    u.exposure.value = w.exposure + flash * 0.35;

    hexToRgb(w.ambientSky, _rgb);
    u.ambientSky.value.set(_rgb.r, _rgb.g, _rgb.b);
    hexToRgb(w.ambientGround, _rgb);
    u.ambientGround.value.set(_rgb.r, _rgb.g, _rgb.b);
    hexToRgb(w.zenith, _rgb);
    u.skyZenith.value.set(_rgb.r, _rgb.g, _rgb.b);
    hexToRgb(w.horizon, _rgb);
    u.skyHorizon.value.set(_rgb.r, _rgb.g, _rgb.b);
    hexToRgb(w.sunColor, _rgb);
    u.sunColor.value.set(_rgb.r, _rgb.g, _rgb.b);
    u.setSunAngles(degToRad(w.sunAzimuth), degToRad(w.sunElevation));
    u.cloudCover.value = w.cloud;
    u.lightning.value = flash;

    // Background behind the sky dome (never seen unless the dome is hidden), Three.js lights
    this.scene.background.set(lerpHex(w.horizon, w.zenith, 0.42));

    this.lighting.sun.color.set(w.sunColor);
    this.lighting.sun.intensity = w.sunIntensity * 0.85 + flash * 4.5;
    this.lighting.hemisphere.color.set(w.ambientSky);
    this.lighting.hemisphere.groundColor.set(w.ambientGround);
    this.renderer.webgpuRenderer.toneMappingExposure = w.exposure + flash * 0.35;
  }

  /**
   * Feed the governor one frame; apply its rung when it changes it. Then it holds still until
   * the GPU has finished every frame drawn so far – those say nothing about the new rung.
   * @param {number} rawDt seconds since the previous frame
   */
  #sampleQuality(rawDt) {
    if (!this.store.get('render.autoQuality')) return;
    const level = this.governor.sample(rawDt * 1000, performance.now());
    if (level === null) return;
    this.#applyQuality('governor');
    const device = this.renderer.webgpuRenderer.backend?.device;
    if (device)
      device.queue.onSubmittedWorkDone().then(() => this.governor.resume(performance.now()));
    else this.governor.resume(performance.now());
  }

  /** @param {string} reason */
  #applyQuality(reason) {
    const rung = this.governor.rung;
    this.renderer.setRenderScale(rung.renderScale);
    this.fx.setParticleScale(rung.particles);
    this.bus.emit(Events.QUALITY_CHANGED, {
      tier: this.tierName,
      level: this.governor.level,
      label: rung.label,
      reason,
    });
  }

  /**
   * Save the frame just drawn as a PNG. Called in the same task as the render, while the canvas
   * still holds that frame (a WebGPU canvas is cleared once the frame is presented).
   */
  #saveScreenshot() {
    this.#screenshotPending = false;
    const name = `pixel-street_${fileSlug(this.store.get('weather.preset'))}_seed${this.store.get('street.seed')}.png`;
    this.renderer.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, name);
      else console.warn('[App] screenshot failed: the canvas gave no image');
    }, 'image/png');
  }

  dispose() {
    this.renderer?.webgpuRenderer.setAnimationLoop(null);
    if (this.loop) {
      for (const sys of this.loop.systems) {
        sys.dispose();
      }
    }
    this.partsShowcase?.dispose();
    this.tireWetness?.dispose();
    this.forge?.dispose();
    this.fpsMeter?.dispose();
    this.skyView?.dispose();
    this.atlas?.dispose();
    this.cameraRig?.dispose();
    this.lighting?.dispose();
    this.renderer?.dispose();
  }
}
