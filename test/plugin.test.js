const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

const pluginFactory = require('../index');
const openApi = require('../openapi.json');
const {
  createApp,
  createRouter,
  lastValues,
  sampleConfiguration,
  valueAt,
  waitFor,
} = require('./support/stubs');

describe('plugin baseline', () => {
  it('exposes the SignalK plugin interface', () => {
    const plugin = pluginFactory(createApp(sampleConfiguration()));

    assert.equal(plugin.id, 'signalk-sailsconfig');
    assert.equal(plugin.name, 'Sails Configuration');
    assert.ok(plugin.description);
    assert.equal(typeof plugin.start, 'function');
    assert.equal(typeof plugin.stop, 'function');
    assert.equal(typeof plugin.registerWithRouter, 'function');
    assert.equal(typeof plugin.getOpenApi, 'function');
    assert.equal(typeof plugin.schema, 'object');
  });

  it('declares a configuration schema for the delta interval and the inventory', () => {
    const { schema } = pluginFactory(createApp());

    assert.deepEqual(schema.required, ['deltaInterval']);
    assert.equal(schema.properties.deltaInterval.type, 'number');
    assert.equal(schema.properties.deltaInterval.default, 60);

    const sails = schema.properties.sails;
    assert.equal(sails.type, 'array');
    assert.deepEqual(sails.items.required, ['id', 'name', 'type', 'area']);
    assert.ok(sails.items.properties.type.enum.includes('mainsail'));
    assert.ok(sails.items.properties.type.enum.includes('other'));
    assert.equal(sails.items.properties.active.default, false);
    assert.deepEqual(
      Object.keys(sails.items.properties.reducedState.properties).sort(),
      ['furledRatio', 'reefs']
    );
  });

  it('serves the bundled OpenAPI description', () => {
    const plugin = pluginFactory(createApp());
    const api = plugin.getOpenApi();

    assert.equal(api, openApi);
    assert.ok(api.openapi.startsWith('3.'));
    assert.equal(api.info.title, 'SignalK SailsConfig API');
    assert.ok(api.paths['/sails']);
  });

  it('registers a route for every documented endpoint', () => {
    const plugin = pluginFactory(createApp(sampleConfiguration()));
    const router = createRouter();

    plugin.registerWithRouter(router);

    const registered = router.routes.map((r) => `${r.method} ${r.path}`);
    assert.deepEqual(registered.sort(), [
      'GET /sails',
      'POST /sails',
      'PUT /sails',
      'PUT /sails/:id/active',
      'PUT /sails/:id/reducedState',
    ]);

    // every path documented in the OpenAPI description has to be routable
    Object.entries(openApi.paths).forEach(([path, methods]) => {
      Object.keys(methods).forEach((method) => {
        const expected = `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`;
        assert.ok(registered.includes(expected), `${expected} is documented but not registered`);
      });
    });
  });

  it('opens reading to readonly and state changes to readwrite, editing stays admin', () => {
    const plugin = pluginFactory(createApp(sampleConfiguration()));
    const router = createRouter({ access: true });

    plugin.registerWithRouter(router);

    const levels = Object.fromEntries(router.routes.map((r) => [`${r.method} ${r.path}`, r.level]));
    assert.deepEqual(levels, {
      'GET /sails': 'readonly',
      'POST /sails': 'admin',
      'PUT /sails': 'readwrite',
      'PUT /sails/:id/active': 'readwrite',
      'PUT /sails/:id/reducedState': 'readwrite',
    });
  });
});

describe('plugin lifecycle', () => {
  it('publishes the inventory and the sail areas on start', (t) => {
    const app = createApp(sampleConfiguration());
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.deepEqual(app.errors, []);
    assert.equal(app.deltas.length, 1);
    assert.equal(app.deltas[0].id, 'signalk-sailsconfig');

    const values = lastValues(app);
    assert.deepEqual(
      values.map((v) => v.path),
      ['sails.inventory.main', 'sails.inventory.genoa', 'sails.area.total', 'sails.area.active']
    );

    // id and description are not part of the SignalK representation of a sail
    const main = valueAt(app, 'sails.inventory.main');
    assert.equal(main.id, undefined);
    assert.equal(main.description, undefined);
    assert.equal(main.name, 'Main');
    assert.equal(main.area, 40);

    assert.equal(valueAt(app, 'sails.area.total'), 90);
    assert.equal(valueAt(app, 'sails.area.active'), 0);
    assert.deepEqual(app.statuses, ['No sails set as active.']);
  });

  it('starts without a stored configuration', (t) => {
    const app = createApp(undefined);
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.deepEqual(app.errors, []);
    assert.deepEqual(
      lastValues(app),
      [
        { path: 'sails.area.total', value: 0 },
        { path: 'sails.area.active', value: 0 },
      ]
    );
    assert.deepEqual(app.statuses, ['No sails set as active.']);
  });

  it('reports the full area of an active sail that is not reduced', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    const app = createApp(configuration);
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.equal(valueAt(app, 'sails.area.active'), 40);
    assert.deepEqual(app.statuses, ['40m2 sail area active with Main']);
  });

  it('reports the reefed area of an active sail with fixed reefs', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    configuration.sails[0].reducedState = { reefs: 2 };
    const app = createApp(configuration);
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.equal(valueAt(app, 'sails.area.active'), 20);
  });

  it('falls back to the full area for a reef that has no area configured', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    configuration.sails[0].reducedState = { reefs: 3 };
    const app = createApp(configuration);
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.equal(valueAt(app, 'sails.area.active'), 40);
  });

  it('reports the furled area of an active continuously reefing sail', (t) => {
    const configuration = sampleConfiguration();
    configuration.sails[0].active = true;
    configuration.sails[1].active = true;
    configuration.sails[1].reducedState = { furledRatio: 0.4 };
    const app = createApp(configuration);
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });

    assert.equal(valueAt(app, 'sails.area.total'), 90);
    assert.equal(valueAt(app, 'sails.area.active'), 70);
    assert.deepEqual(app.statuses, ['70m2 sail area active with Main, Genoa']);
  });

  it('repeats the deltas on the configured interval and stops on shutdown', async (t) => {
    const app = createApp(sampleConfiguration());
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 0.05 });
    assert.equal(app.deltas.length, 1);

    await waitFor(() => app.deltas.length >= 4, 'the deltas to be repeated');

    plugin.stop();
    const whileRunning = app.deltas.length;
    await delay(250);
    assert.equal(app.deltas.length, whileRunning);
    assert.deepEqual(app.errors, []);
  });

  it('can be restarted after being stopped', (t) => {
    const app = createApp(sampleConfiguration());
    const plugin = pluginFactory(app);
    t.after(() => plugin.stop());

    plugin.start({ deltaInterval: 60 });
    plugin.stop();
    plugin.start({ deltaInterval: 60 });

    assert.equal(app.deltas.length, 2);
    assert.deepEqual(app.errors, []);
  });

  it('stops cleanly even when it was never started', () => {
    const plugin = pluginFactory(createApp(sampleConfiguration()));
    assert.doesNotThrow(() => plugin.stop());
  });
});
