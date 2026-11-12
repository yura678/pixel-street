/**
 * Pixel art post-processing pipeline using Three.js WebGPU RenderPipeline.
 *
 * Effects chain:
 *  1. Scene pass, multisampled (MSAA is the only antialiasing: FXAA on top cost ~8.5 ms a frame
 *     on an integrated GPU at 1600 × 900 and was dropped)
 *  2. Warm HDR bloom on bulbs, neon, shop displays & window highlights
 *  3. Tone mapping & sRGB color conversion (`renderOutput`)
 *  4. Color saturation adjustment
 *  5. 4x4 Bayer matrix ordered dithering
 *  6. Palette quantization (posterization)
 */
import { RenderPipeline } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  pass,
  renderOutput,
  saturation,
  posterize,
  clamp,
  dot,
  float,
  mix,
  screenUV,
  select,
  smoothstep,
  Fn,
  vec3,
  vec4,
} from 'three/tsl';
import { ditherOffset } from './tsl/dither.js';

export class PixelPipeline {
  #pipeline;
  #scenePass;

  /**
   * @param {import('three/webgpu').WebGPURenderer} renderer
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {import('./uniforms/WorldUniforms.js').WorldUniforms} uniforms
   * @param {object} [options]
   * @param {number} [options.samples=4] MSAA samples of the scene pass (the quality tier's)
   * @param {Set<string>} [options.bench] stages switched off for measuring (`?bench=`):
   *   `nobloom`, `nograde`, `nopost`
   */
  constructor(renderer, scene, camera, uniforms, { samples = 4, bench = new Set() } = {}) {
    this.#pipeline = new RenderPipeline(renderer);

    // 1. Multisampled scene pass (`samples: 4` eliminates geometric silhouette shimmer)
    this.#scenePass = pass(scene, camera, { samples });
    this.#scenePass.setResolutionScale(1.0);

    // 2. Subtle warm bloom on HDR values (lamp bulbs, neon plaques, boutique displays,
    //    sun-kissed window glass) before tone mapping, so golden-hour highlights bleed
    //    a cozy halo without washing out the masonry.
    const sceneColor = this.#scenePass.getTextureNode('output');
    let bloomColor = sceneColor;
    if (!bench.has('nobloom') && !bench.has('nopost')) {
      const bloomPass = bloom(sceneColor, 0.24, 0.42, 0.95);
      bloomColor = vec4(sceneColor.rgb.add(bloomPass.rgb.mul(vec3(1.0, 0.88, 0.72))), sceneColor.a);
    }

    // 3. LDR Tone mapping & Color Space conversion to sRGB
    const ldrColor = renderOutput(bloomColor);
    this.#pipeline.outputColorTransform = false;
    if (bench.has('nopost')) {
      this.#pipeline.outputNode = ldrColor;
      return;
    }

    if (bench.has('nograde')) {
      this.#pipeline.outputNode = ldrColor;
      return;
    }

    // 4. Diorama Miniature Grading + Optional Retro Dither/Posterize
    const pixelArtPass = Fn(() => {
      const srcColor = ldrColor;
      const rgb = srcColor.rgb;

      // Saturation & gentle warm shadow lift for handcrafted miniature feel
      const saturated = saturation(rgb, uniforms.saturation);

      // 4x4 Bayer Dither offset (only active when enabled)
      const offset = ditherOffset(uniforms.paletteLevels, uniforms.ditherStrength);
      const ditheredRgb = clamp(saturated.add(offset), 0.0, 1.0);

      const colorToQuantize = select(
        uniforms.ditherEnabled.greaterThan(0.5),
        ditheredRgb,
        saturated,
      );

      // Bypass harsh posterize bands at max slider (64) for velvety diorama gradients
      const quantized = select(
        uniforms.paletteLevels.lessThan(63.5),
        posterize(colorToQuantize, uniforms.paletteLevels),
        colorToQuantize,
      );

      // Subtle cinematic miniature lens vignette framing the street
      const centered = screenUV.sub(0.5).mul(vec3(1.18, 1.0, 0.0).xy);
      const r2 = dot(centered, centered);
      const vig = float(1.0).sub(smoothstep(0.14, 0.72, r2).mul(0.17));
      const graded = mix(quantized.mul(vec3(0.84, 0.8, 0.78)), quantized, vig);

      return vec4(graded, srcColor.a);
    });

    // Set pipeline output. Tone mapping and sRGB conversion were already performed in
    // `renderOutput` (`outputColorTransform = false` above prevents doing them twice).
    this.#pipeline.outputNode = pixelArtPass();
  }

  get pipeline() {
    return this.#pipeline;
  }

  get scenePass() {
    return this.#scenePass;
  }

  /**
   * Render the frame using the post-processing pipeline.
   */
  render() {
    this.#pipeline.render();
  }
}
