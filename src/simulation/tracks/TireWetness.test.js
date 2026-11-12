import { describe, it, expect } from 'vitest';
import { TireWetness } from './TireWetness.js';
import { EventBus, Events } from '../../core/EventBus.js';

describe('TireWetness', () => {
  it('wheel wetness jumps to 1.0 upon entering a puddle', () => {
    const bus = new EventBus();
    const tracks = new TireWetness(bus);

    expect(tracks.getWetness(0)).toBe(0);

    bus.emit(Events.WHEEL_ENTER_PUDDLE, { wheel: 0, x: 0, z: 0, speed: 10 });
    expect(tracks.getWetness(0)).toBe(1.0);
    expect(tracks.getWetness(1)).toBe(0);
  });

  it('dries out with distance, but not below road wetness', () => {
    const bus = new EventBus();
    const tracks = new TireWetness(bus, { dryDistance: 20 });

    bus.emit(Events.WHEEL_ENTER_PUDDLE, { wheel: 2, x: 0, z: 0, speed: 10 });

    // Drive 10m at 10m/s for 1s
    tracks.update(1.0, 10, 0.0);
    expect(tracks.getWetness(2)).toBeCloseTo(0.5, 2);

    // Drive another 20m with ambient road wetness 0.2
    tracks.update(2.0, 10, 0.2);
    expect(tracks.getWetness(2)).toBe(0.2);
  });
});
