/*
    Copyright © 2026 Inspired Technologies GmbH (www.inspiredtechnologies.eu)
    forked from @signalk/sailsconfiguration by 2017 Teppo Kurki <teppo.kurki@iki.fi>
    License granted under the Apache License, Version 2.0 (the "License")
 
    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
*/
const openAPI = require('./openapi.json');

const pluginId = "signalk-sailsconfig";

module.exports = function(app) {
  let plugin = {};
  let timer;
  const debug = app.debug
  function setDeltas() {
    let totalArea = 0;
    let activeArea = 0;
    let activeSails = [];
    let { configuration } = app.readPluginOptions();
    if (!configuration) {
      configuration = {};
    }
    const values = (configuration.sails || []).map(sail => {
      // No id or description in the sail as used in Signal K
      const sailClone = JSON.parse(JSON.stringify(sail));
      delete sailClone.id;
      delete sailClone.description;

      // Calculate into sail area available
      totalArea += sail.area;
      if (sail.active) {
        activeSails.push(sail.name);
        // Calculate into active sail area
        if (sail.reducedState && sail.reducedState.furledRatio) {
          activeArea += sail.area - (sail.area * sail.reducedState.furledRatio);
        } else if (sail.reducedState && sail.reducedState.reefs) {
          const reefedArea = sail.reefs[sail.reducedState.reefs - 1] || sail.area;
          activeArea += reefedArea;
        } else {
          activeArea += sail.area;
        }
      }

      return {
        path: "sails.inventory." + sail.id,
        value: sailClone,
      };
    });
    values.push({
      path: 'sails.area.total',
      value: totalArea,
    });
    values.push({
      path: 'sails.area.active',
      value: activeArea,
    });
    app.handleMessage(pluginId, {
      updates: [
        {
          values: values
        }
      ]
    });
    if (activeArea > 0) {
      app.setPluginStatus(`${activeArea}m2 sail area active with ${activeSails.join(', ')}`);
    } else {
      app.setPluginStatus('No sails set as active.');
    }
  }

  plugin.start = function(props) {
    debug("starting");
    timer = setInterval(setDeltas, props.deltaInterval * 1000);
    setDeltas();
    debug("started");
    app.setPluginStatus("Started");
  };

  plugin.stop = function() {
    debug("stopping");
    timer && clearTimeout(timer);
    debug("stopped");
  };

  plugin.signalKApiRoutes = function (router) {
    router.get('/vessels/self/sails/inventory', sails.inventory)
    router.get('/vessels/' + app.selfId + '/sails/inventory', sails.inventory)
    sails.list().forEach(sail =>
    {
      router.get('/vessels/self/sails/inventory/'+sail, sails.spec)
      router.get('/vessels/' + app.selfId + '/sails/inventory/'+sail, sails.spec)  
    })
    app.debug("'inventory' endpoint registered");
    return router
  }

  plugin.id = pluginId;
  plugin.name = "Sails Configuration";
  plugin.description =
    "Plugin to define and manage your vessel's sails inventory and configuration";

  plugin.schema = {
    type: "object",
    required: ["deltaInterval", "putToken"],
    properties: {
      deltaInterval: {
        title: 'How often should this plugin update the state, in seconds',
        type: "number",
        default: 60
      },
      putToken: {
        type: "string",
        default: "SailsConfig/1.0.0"
      },
      sails: {
        type: "array",
        title: "Sail inventory",
        items: {
          type: "object",
          required: ["id", "name", "type", "area"],
          properties: {
            id: {
              type: "string",
              title: "Id",
              pattern: "(^[a-zA-Z0-9]+$)",
            },
            name: {
              type: "string",
              title: "Name or Label",
              description: "An unique identifier by which the crew identifies a sail"
            },
            name: {
              type: "bool",
              title: "Name or Label",
              description: "An unique identifier by which the crew identifies a sail"
            },
            material: {
              type: "string",
              title: "Material",
              description: "[Optional] The material the sail is made from"
            },
            brand: {
              type: "string",
              title: "Description",
              'ui:widget': 'textarea',
            },
            type: {
              type: "string",
              title: "Sail type",
              enum: [
                "staysail",
                "headsail",
                "jib",
                "genoa",
                "spinnaker",
                "gennaker",
                "mainsail",
                "lug",
                "mizzen",
                "steadying sail",
              ],
            },
            material: {
              type: 'string',
              title: 'Material',
            },
            brand: {
              type: 'string',
              title: 'Brand',
            },
            active: {
              type: 'boolean',
              title: 'Whether the sail is currently in use',
              default: false,
            },
            area: {
              type: "number",
              title: "Sail area in square meters"
            },
            minimumWind: {
              type: "number",
              title: "The minimum wind speed this sail can be used with, in m/s",
            },
            maximumWind: {
              type: "number",
              title: "The maximum wind speed this sail can be used with, in m/s",
            },
            reefs: {
              type: "array",
              title: "Reefed sail areas",
              description: "In descending order, leave empty if no fixed reefs",
              items: {
                type: "number",
              }
            },
            continuousReefing: {
              type: "boolean",
              title: "The sail can be reefed continuously, with no discreet steps"
            },
            reducedState: {
              title: "Reefing state",
              type: 'object',
              properties: {
                reefs: {
                  type: 'number',
                  title: 'Number of reefs set, 0 means full',
                  default: 0,
                },
                furledRatio: {
                  type: 'number',
                  title: 'Ratio of sail reduction, 0 means full and 1 is completely furled in',
                  default: 0,
                },
              },
            },
          }
        }
      }
    }
  };

  plugin.registerWithRouter = function(router) {
    router.get('/sails', function(req, res) {
      res.contentType('application/json');
      const { configuration } = app.readPluginOptions();
      if (!configuration) {
        res.send(JSON.stringify([]));
        return;
      }
      const result = configuration.sails.map(function(sail) {
        return {
          id: sail.id,
          name: sail.name,
          active: sail.active,
          reducedState: sail.reducedState,
        };
      });
      res.send(JSON.stringify(result));
    });
    router.put('/sails', function(req, res) {
      res.contentType('application/json');
      let { configuration } = app.readPluginOptions();
      if (!configuration) {
        // If there is no sails inventory, there is no valid payload we can accept
        res.sendStatus(400);
        return;
      }
      let failed = false;
      req.body.forEach(function (sail) {
        if (failed) {
          return;
        }
        const sailInConfig = configuration.sails.find((s) => s.id === sail.id);
        if (!sailInConfig) {
          // Trying to set state to unknown sail, fail
          failed = true;
          res.sendStatus(400);
          return;
        }
        sailInConfig.active = sail.active;
        sailInConfig.reducedState = sail.reducedState;
      });
      // Deactivate any saild _not_ provided in payload
      const payloadIds = req.body.map((s) => s.id);
      configuration.sails.filter((s) => !payloadIds.includes(s.id)).forEach((s) => {
        s.active = false;
      });
      if (failed) {
        return;
      }
      app.savePluginOptions(configuration, function (err) {
        if (err) {
          res.sendStatus(500);
          return;
        }
        setDeltas();
        res.sendStatus(200);
      });
    });
    router.put('/sails/:id/active', function(req, res) {
      res.contentType('application/json');
      const { configuration } = app.readPluginOptions();
      if (!configuration) {
        res.sendStatus(404);
        return;
      }
      const sailInConfig = configuration.sails.find(function (s) {
        if (s.id === req.params.id) {
          return true;
        }
        return false;
      });
      if (!sailInConfig) {
        res.sendStatus(404);
        return;
      }
      sailInConfig.active = req.body.value;
      app.savePluginOptions(configuration, function (err) {
        if (err) {
          res.sendStatus(500);
          return;
        }
        setDeltas();
        res.sendStatus(200);
      });
    });
    router.put('/sails/:id/reducedState', function(req, res) {
      res.contentType('application/json');
      const { configuration } = app.readPluginOptions();
      if (!configuration) {
        res.sendStatus(404);
        return;
      }
      const sailInConfig = configuration.sails.find(function (s) {
        if (s.id === req.params.id) {
          return true;
        }
        return false;
      });
      if (!sailInConfig) {
        res.sendStatus(404);
        return;
      }
      sailInConfig.reducedState = req.body;
      app.savePluginOptions(configuration, function (err) {
        if (err) {
          res.sendStatus(500);
          return;
        }
        setDeltas();
        res.sendStatus(200);
      });
    });
  };

  plugin.getOpenApi = function() {
    return openAPI;
  };

  return plugin;
};
