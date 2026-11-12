/**
 * Full-screen message shown when WebGPU is unavailable (there is intentionally no WebGL
 * fallback) or when start-up fails.
 */

const REASONS = {
  insecure:
    'WebGPU requires a secure context. Open the page via <code>https://</code> or <code>localhost</code> (use <code>npm run dev:mobile</code> for phones).',
  'no-api': 'This browser does not expose the WebGPU API (<code>navigator.gpu</code>).',
  'no-adapter':
    'WebGPU is present, but no compatible GPU adapter was found (it may be blocklisted or disabled).',
  error: 'The renderer failed to start.',
};

/**
 * @param {keyof typeof REASONS | string} reason
 * @param {unknown} [detail] error object or message, shown in small print
 */
export function showUnsupported(reason, detail) {
  const el = document.createElement('section');
  el.className = 'unsupported';
  el.setAttribute('role', 'alert');
  const title = reason === 'error' ? 'Something went wrong' : 'WebGPU not supported';
  el.innerHTML = `
    <div class="unsupported__card">
      <h1>${title}</h1>
      <p>${REASONS[reason] ?? REASONS.error}</p>
      <p>Pixel Street runs on WebGPU. Supported browsers:</p>
      <ul>
        <li>Chrome / Edge 113+ (Windows, macOS, ChromeOS)</li>
        <li>Chrome 121+ on Android 12+</li>
        <li>Safari 26+ (macOS, iOS, iPadOS)</li>
        <li>Firefox 141+ (Windows)</li>
      </ul>
      <p class="unsupported__detail"></p>
    </div>`;
  if (detail) {
    // textContent – never inject error text as HTML.
    el.querySelector('.unsupported__detail').textContent =
      detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail);
  }
  document.body.append(el);
  return el;
}
