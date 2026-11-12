/**
 * WebGPU capability check. No WebGL fallback by design (see PROJECT_STATUS.md).
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'insecure'|'no-api'|'no-adapter', detail?: unknown }>}
 */
export async function checkWebGPU() {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { ok: false, reason: 'insecure' };
  }
  if (typeof navigator === 'undefined' || !navigator.gpu) return { ok: false, reason: 'no-api' };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'no-adapter' };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'no-adapter', detail: err };
  }
}
