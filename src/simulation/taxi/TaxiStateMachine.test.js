import { describe, it, expect } from 'vitest';
import { TaxiStateMachine, TaxiState } from './TaxiStateMachine.js';
import { stoppingDistance } from './kinematics.js';
import { Store } from '../../core/Store.js';
import { EventBus, Events } from '../../core/EventBus.js';
import { PARAM_DEFS } from '../../config/params.schema.js';
import { CENTER_LINE_X, GUTTER_W, LANE_X, ROAD_FAR_X, STOP_X } from '../../config/streetProfile.js';
import { WHEEL_OFFSETS, WHEEL_WIDTH } from '../../config/constants.js';

describe('Taxi Kinematics', () => {
  it('stoppingDistance calculates theoretical d = v^2 / (2a)', () => {
    expect(stoppingDistance(10, 5)).toBe(10);
    expect(stoppingDistance(0, 5)).toBe(0);
    expect(stoppingDistance(10, 0)).toBe(0);
  });
});

describe('TaxiStateMachine', () => {
  const setup = () => {
    const store = new Store(PARAM_DEFS);
    const bus = new EventBus();
    const taxi = new TaxiStateMachine(store, bus);
    return { store, bus, taxi };
  };

  it('accelerates from rest to cruiseSpeed in Cruise state', () => {
    const { store, taxi } = setup();
    const cruiseSpeed = store.get('taxi.cruiseSpeed');

    for (let i = 0; i < 300; i++) {
      taxi.update(1 / 60);
    }

    expect(taxi.state).toBe(TaxiState.CRUISE);
    expect(taxi.speed).toBeCloseTo(cruiseSpeed, 1);
    expect(taxi.x).toBeCloseTo(LANE_X, 2);
  });

  it('stops smoothly at bus stop without overshooting', () => {
    const { bus, taxi } = setup();
    const stateEvents = [];
    bus.on(Events.TAXI_STATE, (e) => stateEvents.push(e));

    // Place a bus stop at Z = 120m
    const stopZ = 120;
    taxi.setNextBusStop(stopZ);

    // Simulate 30 seconds
    const dt = 1 / 60;
    for (let t = 0; t < 30; t += dt) {
      taxi.update(dt);
      if (taxi.state === TaxiState.STOPPED) break;
    }

    expect(taxi.state).toBe(TaxiState.STOPPED);
    expect(taxi.z).toBeCloseTo(stopZ, 1);
    expect(taxi.speed).toBe(0);
    expect(taxi.x).toBeCloseTo(STOP_X, 1);

    expect(stateEvents.map((e) => e.to)).toEqual([TaxiState.APPROACH, TaxiState.STOPPED]);
  });

  it('completes the full stop-and-depart cycle', () => {
    const { store, bus, taxi } = setup();
    store.set('taxi.stopWait', 2.0);
    store.set('taxi.stopWaitJitter', 0.0);

    const stateEvents = [];
    bus.on(Events.TAXI_STATE, (e) => stateEvents.push(e.to));

    taxi.setNextBusStop(80);

    const dt = 1 / 60;
    for (let t = 0; t < 35; t += dt) {
      taxi.update(dt);
      if (taxi.state === TaxiState.CRUISE && stateEvents.includes(TaxiState.DEPARTING)) {
        break;
      }
    }

    expect(stateEvents).toContain(TaxiState.APPROACH);
    expect(stateEvents).toContain(TaxiState.STOPPED);
    expect(stateEvents).toContain(TaxiState.DEPARTING);
    expect(stateEvents).toContain(TaxiState.CRUISE);
    expect(taxi.speed).toBeGreaterThan(0);
  });

  it('drives in scene X: in the middle of the curbside lane, the stop at +1.35 by the gutter', () => {
    const { taxi } = setup();
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) taxi.update(dt);
    expect(taxi.state).toBe(TaxiState.CRUISE);
    expect(Math.abs(taxi.x - LANE_X)).toBeLessThan(0.05);
    // The middle of the lane between the centre line and the far curb
    expect(Math.abs(LANE_X - (CENTER_LINE_X + ROAD_FAR_X) * 0.5)).toBeLessThan(0.1);

    taxi.setNextBusStop(taxi.z + 40);
    for (let t = 0; t < 30 && taxi.state !== TaxiState.STOPPED; t += dt) taxi.update(dt);
    expect(taxi.state).toBe(TaxiState.STOPPED);
    expect(Math.abs(taxi.x - 1.35)).toBeLessThan(0.05);

    // Pulled in, the outer tyre stands in the far gutter, clear of the curb face
    const tyreOut = taxi.x + Math.max(...WHEEL_OFFSETS.map(([x]) => x)) + WHEEL_WIDTH / 2;
    expect(tyreOut).toBeGreaterThan(ROAD_FAR_X - GUTTER_W);
    expect(tyreOut).toBeLessThan(ROAD_FAR_X - 0.03);
  });

  it('passes by bus stops when stopAtBusStops is false', () => {
    const { store, taxi } = setup();
    store.set('taxi.stopAtBusStops', false);
    taxi.setNextBusStop(50);

    const dt = 1 / 60;
    for (let t = 0; t < 15; t += dt) {
      taxi.update(dt);
    }

    expect(taxi.state).toBe(TaxiState.CRUISE);
    expect(taxi.z).toBeGreaterThan(50);
  });
});
