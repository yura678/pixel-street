/**
 * Choosing a weather preset writes the preset's values into the store as *targets*.
 * Every slider stays a live override; WeatherSystem (stage 7) smoothly interpolates the
 * rendered state towards these targets over `weather.transitionTime`.
 */
import { PRESETS } from '../config/weatherPresets.js';
import { Events } from '../core/EventBus.js';

/**
 * @param {import('../core/Store.js').Store} store
 * @param {import('../core/EventBus.js').EventBus} bus
 * @returns {() => void} unsubscribe
 */
export function bindWeatherPresets(store, bus) {
  let current = store.get('weather.preset');
  return store.subscribe('weather.preset', () => {
    const next = store.get('weather.preset');
    const values = PRESETS[next];
    if (!values) return;
    store.setMany(values, 'preset');
    bus.emit(Events.WEATHER_PRESET, { from: current, to: next });
    current = next;
  });
}
