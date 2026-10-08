const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const pluginFactory = require('../index');
const { createApp, createRouter, sampleConfiguration, valueAt } = require('./support/stubs');

// A sail that passes every rule of the SailValidator, used as the payload for
// the POST endpoint.
function stormJib(overrides) {
  return Object.assign(
    {
      id: 'storm',
      name: 'Storm Jib',
      description: 'The heavy weather jib',
      type: 'jib',
      material: 'dacron',
      brand: 'Elvstrom',
      active: false,
      area: 12,
      minimumWind: 10,
      maximumWind: 40,
      reefs: [],
      continuousReefing: false,
      reducedState: { reefs: 0 },
    },
    overrides
  );
}

// Starts the plugin with its REST routes registered, exactly as the SignalK
// server does, and shuts it down again when the test is over.
function setup(t, configuration) {
  const app = createApp(configuration);
  const plugin = pluginFactory(app);
  const router = createRouter();
  plugin.registerWithRouter(router);
  plugin.start({ deltaInterval: 60 });
  t.after(() => plugin.stop());
  return { app, plugin, router };
}

describe('GET /sails', () => {
  it('returns the state of every sail in the inventory', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('GET', '/sails');

    assert.equal(res.statusCode, 200);
    assert.equal(res.contentTypeValue, 'application/json');
    assert.deepEqual(res.json(), [
      { id: 'main', name: 'Main', active: false, reducedState: { reefs: 0 } },
      { id: 'genoa', name: 'Genoa', active: false, reducedState: { furledRatio: 0 } },
    ]);
    assert.deepEqual(app.errors, []);
  });

  it('returns an empty inventory when nothing is configured', (t) => {
    const { router } = setup(t, undefined);

    const res = router.request('GET', '/sails');

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), []);
  });
});

describe('POST /sails', () => {
  it('adds a new sail, persists it and publishes new deltas', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    const { app, router } = setup(t, configuration);
    const deltasOnStart = app.deltas.length;

    const res = router.request('POST', '/sails', [stormJib()]);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), [
      { id: 'main', name: 'Main', active: false, reducedState: { reefs: 0 } },
      { id: 'genoa', name: 'Genoa', active: false, reducedState: { furledRatio: 0 } },
      { id: 'storm', name: 'Storm Jib', active: false, reducedState: { reefs: 0 } },
    ]);

    // persisted and re-published
    assert.equal(app.saves.length, 1);
    assert.equal(app.configuration.sails.length, 3);
    assert.equal(app.deltas.length, deltasOnStart + 1);
    assert.equal(valueAt(app, 'sails.area.total'), 102);
    assert.equal(valueAt(app, 'sails.area.active'), 0);
    assert.deepEqual(app.errors, []);
  });

  it('updates an existing sail and resets its reefing state', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].reducedState = { reefs: 2 };
    const { app, router } = setup(t, configuration);

    const res = router.request('POST', '/sails', [
      stormJib({
        id: 'main',
        name: 'Main',
        type: 'mainsail',
        area: 45,
        reefs: [35, 25],
        reducedState: { reefs: 2 },
      }),
    ]);

    assert.equal(res.statusCode, 200);
    const main = app.configuration.sails.find((s) => s.id === 'main');
    assert.equal(main.area, 45);
    assert.deepEqual(main.reefs, [35, 25]);
    assert.equal(main.description, 'The heavy weather jib');
    // a sail that is edited always returns to its unreduced state
    assert.deepEqual(main.reducedState, { reefs: 0, furledRatio: undefined });
    assert.equal(app.configuration.sails.length, 2);
  });

  it('deactivates every sail that is missing from the payload', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    configuration.sails[1].active = true;
    const { app, router } = setup(t, configuration);

    router.request('POST', '/sails', [stormJib()]);

    assert.deepEqual(
      app.configuration.sails.map((s) => s.active),
      [false, false, false]
    );
  });

  it('rejects an invalid sail without persisting anything', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('POST', '/sails', [stormJib({ type: 'kite', area: 0 })]);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(Object.keys(res.json()), ['Storm Jib']);
    assert.ok(res.json()['Storm Jib'].type);
    assert.ok(res.json()['Storm Jib'].area);
    assert.deepEqual(app.saves, []);
    assert.equal(app.configuration.sails.length, 2);
  });

  it('reports a failure to persist the inventory', (t) => {
    const { app, router } = setup(t, sampleConfiguration());
    app.saveError = new Error('cannot write plugin options');

    const res = router.request('POST', '/sails', [stormJib()]);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(app.saves, []);
  });
});

describe('PUT /sails', () => {
  it('sets the active and reefing state of several sails at once', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails', [
      { id: 'main', active: true, reducedState: { reefs: 1 } },
      { id: 'genoa', active: true, reducedState: { furledRatio: 0.25 } },
    ]);

    assert.equal(res.statusCode, 200);
    const [main, genoa] = app.configuration.sails;
    assert.equal(main.active, true);
    assert.equal(main.reducedState.reefs, 1);
    assert.equal(main.reducedState.furledRatio, undefined);
    assert.equal(genoa.active, true);
    assert.equal(genoa.reducedState.furledRatio, 0.25);
    // a continuously reefing sail never carries discrete reefs
    assert.equal(genoa.reducedState.reefs, undefined);
    assert.deepEqual(genoa.reefs, []);

    // first reef of the main plus three quarters of the genoa
    assert.equal(valueAt(app, 'sails.area.active'), 67.5);
    assert.equal(app.saves.length, 1);
  });

  it('deactivates every sail that is missing from the payload', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    configuration.sails[1].active = true;
    const { app, router } = setup(t, configuration);

    const res = router.request('PUT', '/sails', [
      { id: 'genoa', active: true, reducedState: { furledRatio: 0 } },
    ]);

    assert.equal(res.statusCode, 200);
    assert.equal(app.configuration.sails[0].active, false);
    assert.equal(app.configuration.sails[1].active, true);
    assert.equal(valueAt(app, 'sails.area.active'), 50);
  });

  it('rejects an unknown sail id', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails', [
      { id: 'ghost', active: true, reducedState: { reefs: 0 } },
    ]);

    assert.equal(res.statusCode, 400);
    assert.match(res.json().ghost.id, /not found/i);
    assert.deepEqual(app.saves, []);
  });

  it('rejects a reef that the sail does not have', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails', [
      { id: 'main', active: true, reducedState: { reefs: 5 } },
    ]);

    assert.equal(res.statusCode, 400);
    assert.ok(res.json().main.reducedState.reefs);
    assert.equal(app.configuration.sails[0].active, false);
    assert.deepEqual(app.saves, []);
  });

  it('rejects a payload when no inventory is configured', (t) => {
    const { router } = setup(t, undefined);

    const res = router.request('PUT', '/sails', [
      { id: 'main', active: true, reducedState: { reefs: 0 } },
    ]);

    assert.equal(res.statusCode, 400);
  });
});

describe('PUT /sails/:id/active', () => {
  it('activates a single sail and republishes the areas', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails/main/active', { value: true });

    assert.equal(res.statusCode, 200);
    assert.equal(app.configuration.sails[0].active, true);
    assert.equal(valueAt(app, 'sails.area.active'), 40);
    assert.deepEqual(app.statuses.slice(-1), ['40m2 sail area active with Main']);
  });

  it('rejects a non boolean value', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails/main/active', { value: 'yes' });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().value, /boolean/i);
    assert.deepEqual(app.saves, []);
  });

  it('returns 404 for an unknown sail', (t) => {
    const { router } = setup(t, sampleConfiguration());

    assert.equal(router.request('PUT', '/sails/ghost/active', { value: true }).statusCode, 404);
  });

  it('returns 404 when no inventory is configured', (t) => {
    const { router } = setup(t, undefined);

    assert.equal(router.request('PUT', '/sails/main/active', { value: true }).statusCode, 404);
  });

  it('reports a failure to persist the state', (t) => {
    const { app, router } = setup(t, sampleConfiguration());
    app.saveError = new Error('cannot write plugin options');

    assert.equal(router.request('PUT', '/sails/main/active', { value: true }).statusCode, 500);
  });
});

describe('PUT /sails/:id/reducedState', () => {
  it('reefs a sail with fixed reefs', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    const { app, router } = setup(t, configuration);

    const res = router.request('PUT', '/sails/main/reducedState', { reefs: 2 });

    assert.equal(res.statusCode, 200);
    assert.equal(app.configuration.sails[0].reducedState.reefs, 2);
    assert.equal(app.configuration.sails[0].reducedState.furledRatio, undefined);
    assert.equal(valueAt(app, 'sails.area.active'), 20);
  });

  it('furls a continuously reefing sail', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[1].active = true;
    const { app, router } = setup(t, configuration);

    const res = router.request('PUT', '/sails/genoa/reducedState', { furledRatio: 0.5 });

    assert.equal(res.statusCode, 200);
    assert.equal(app.configuration.sails[1].reducedState.furledRatio, 0.5);
    assert.equal(app.configuration.sails[1].reducedState.reefs, undefined);
    assert.equal(valueAt(app, 'sails.area.active'), 25);
  });

  it('rejects a furled ratio outside of 0 to 1', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails/genoa/reducedState', { furledRatio: 1.5 });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().furledRatio, /between 0 and 1/i);
    assert.deepEqual(app.saves, []);
  });

  it('rejects a reef the sail does not have', (t) => {
    const { app, router } = setup(t, sampleConfiguration());

    const res = router.request('PUT', '/sails/main/reducedState', { reefs: 4 });

    assert.equal(res.statusCode, 400);
    assert.match(res.json().reefs, /smaller than 2/i);
    assert.deepEqual(app.saves, []);
  });

  it('returns 404 for an unknown sail', (t) => {
    const { router } = setup(t, sampleConfiguration());

    assert.equal(router.request('PUT', '/sails/ghost/reducedState', { reefs: 0 }).statusCode, 404);
  });

  it('returns 404 when no inventory is configured', (t) => {
    const { router } = setup(t, undefined);

    assert.equal(router.request('PUT', '/sails/main/reducedState', { reefs: 0 }).statusCode, 404);
  });

  it('reports a failure to persist the state', (t) => {
    const { app, router } = setup(t, sampleConfiguration());
    app.saveError = new Error('cannot write plugin options');

    assert.equal(router.request('PUT', '/sails/main/reducedState', { reefs: 1 }).statusCode, 500);
  });
});
