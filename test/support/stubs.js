/*
  Minimal stand-ins for the parts of the SignalK server the plugin talks to.
  They keep every lifecycle test runnable from the command line via `node --test`,
  without a running server, an express app or any network access.
*/

function clone(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

// Stand-in for the SignalK server `app` object handed to the plugin factory.
// Every member used by index.js has to be present, otherwise the plugin fails
// at startup.
function createApp(configuration) {
  const app = {
    deltas: [],
    statuses: [],
    errors: [],
    saves: [],
    debugs: [],
    configuration,
    // when set, savePluginOptions reports this error to its callback
    saveError: null,
    debug: (msg) => app.debugs.push(msg),
    error: (msg) => app.errors.push(msg),
    setPluginStatus: (msg) => app.statuses.push(msg),
    setPluginError: (msg) => app.errors.push(msg),
    readPluginOptions: () => ({ configuration: app.configuration }),
    savePluginOptions: (options, callback) => {
      if (app.saveError) {
        callback && callback(app.saveError);
        return;
      }
      app.configuration = options;
      app.saves.push(clone(options));
      callback && callback();
    },
    handleMessage: (id, delta) => app.deltas.push({ id, delta }),
  };
  return app;
}

// Collects the values of the most recent delta sent by the plugin.
function lastValues(app) {
  const last = app.deltas[app.deltas.length - 1];
  if (!last) return [];
  return last.delta.updates[0].values;
}

function valueAt(app, path) {
  const found = lastValues(app).find((v) => v.path === path);
  return found && found.value;
}

// Polls until a condition holds, so timer driven tests stay reliable on slow
// or heavily loaded CI runners.
async function waitFor(condition, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${description}`);
}

// Stand-in for the express response, recording what the plugin replied with.
function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined,
    contentTypeValue: undefined,
    ended: false,
    contentType(type) {
      res.contentTypeValue = type;
      return res;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    send(payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    sendStatus(code) {
      res.statusCode = code;
      res.body = undefined;
      res.ended = true;
      return res;
    },
    json() {
      return res.body === undefined ? undefined : JSON.parse(res.body);
    },
  };
  return res;
}

// Stand-in for the express router the SignalK server passes to
// plugin.registerWithRouter, with just enough routing to dispatch a request.
// With { access: true } it also offers router.access(level) like Signal K
// 2.x servers and records the level of each route; a route registered on the
// plain router keeps the level 'admin', the server's default for plugin routes.
function createRouter({ access = false } = {}) {
  const routes = [];

  function match(method, url) {
    const parts = url.split('/');
    return routes
      .filter((route) => route.method === method)
      .map((route) => {
        const pattern = route.path.split('/');
        if (pattern.length !== parts.length) return null;
        const params = {};
        for (let i = 0; i < pattern.length; i += 1) {
          if (pattern[i].startsWith(':')) {
            params[pattern[i].slice(1)] = decodeURIComponent(parts[i]);
          } else if (pattern[i] !== parts[i]) {
            return null;
          }
        }
        return { route, params };
      })
      .find((candidate) => candidate !== null);
  }

  const router = {
    routes,
    request(method, url, body) {
      const matched = match(method, url);
      if (!matched) {
        throw new Error(`no route registered for ${method} ${url}`);
      }
      const res = createResponse();
      matched.route.handler({ params: matched.params, body, method, url }, res);
      return res;
    },
  };

  function register(target, level) {
    ['get', 'post', 'put', 'delete'].forEach((method) => {
      target[method] = (path, handler) => {
        routes.push({ method: method.toUpperCase(), path, handler, level });
      };
    });
    return target;
  }

  register(router, 'admin');
  if (access) {
    router.access = (level) => register({}, level);
  }

  return router;
}

// A fully reefable mainsail and a continuously furling genoa, enough to cover
// both ways of reducing sail area.
function sampleConfiguration() {
  return {
    deltaInterval: 60,
    sails: [
      {
        id: 'main',
        name: 'Main',
        description: 'The main sail',
        type: 'mainsail',
        material: 'dacron',
        brand: 'Elvstrom',
        active: false,
        area: 40,
        minimumWind: 0,
        maximumWind: 25,
        reefs: [30, 20],
        continuousReefing: false,
        reducedState: { reefs: 0 },
      },
      {
        id: 'genoa',
        name: 'Genoa',
        description: 'The roller furling genoa',
        type: 'genoa',
        material: 'dacron',
        brand: 'Elvstrom',
        active: false,
        area: 50,
        minimumWind: 0,
        maximumWind: 20,
        reefs: [],
        continuousReefing: true,
        reducedState: { furledRatio: 0 },
      },
    ],
  };
}

module.exports = {
  clone,
  createApp,
  createResponse,
  createRouter,
  lastValues,
  sampleConfiguration,
  valueAt,
  waitFor,
};
