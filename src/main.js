/**
 * Entry point & WebGPU environment bootstrap.
 */
import './ui/styles/base.css';
import './ui/styles/forge.css';
import { checkWebGPU } from './app/webgpuSupport.js';
import { showUnsupported } from './ui/UnsupportedScreen.js';
import { App } from './app/App.js';

async function bootstrap() {
  const support = await checkWebGPU();
  if (!support.ok) {
    showUnsupported(support.reason, support.detail);
    return;
  }

  try {
    const app = new App();
    await app.start();
  } catch (err) {
    console.error('Fatal application error:', err);
    showUnsupported('error', err);
  }
}

bootstrap();
