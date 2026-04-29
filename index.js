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
const { SailValidator, UpdateValidator, StatusValidator, StateValidator } = require('./validator.js');

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

  function setState(sail, state) {
    sail.reducedState = state;
    if (state && sail.continuousReefing) {
      // If continuousReefing is set, use furledRatio
      sail.reducedState.reefs = undefined;
      sail.reefs = []; 
    } else if (state && !sail.continuousReefing) {
      if (state.reefs > 0 && (sail.reefs[state.reefs-1] === 0 || sail.reefs[state.reefs-1] === undefined))
      // If both reefs and furledRatio are set, use reefs
      sail.reefs[state.reefs-1] = state.furledRatio * sail.area;
      if (state.reefs >= 0)
        sail.reducedState.furledRatio = undefined;
    }
    debug(`setting state of ${sail.name} to ${JSON.stringify(sail.reducedState)}`);
  }

  plugin.start = function(props) {
    debug("starting");
    timer = setInterval(setDeltas, props.deltaInterval * 1000);
    setDeltas();
    debug("started");
  };

  plugin.stop = function() {
    debug("stopping");
    timer && clearTimeout(timer);
    debug("stopped");
  };

  plugin.id = pluginId;
  plugin.name = "Sails Configuration";
  plugin.description =
    "Plugin that allows you to define your vessel's sails inventory and configuration";

  plugin.schema = {
    type: "object",
    required: ["deltaInterval"],
    properties: {
      deltaInterval: {
        title: 'How often should this plugin update the state, in seconds',
        type: "number",
        default: 60
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
              pattern: "(^[a-zA-Z0-9-]+$)",
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
                "other"
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
    router.post('/sails', function(req, res) {
      res.contentType('application/json');
      let { configuration } = app.readPluginOptions();
      let failed = false;
      const validator = new SailValidator();
      let validationResult = {}
      req.body.forEach(function (sail) {
        const sailInConfig = configuration.sails.find((s) => s.id === sail.id);
        const val = validator.validate(sail);
        if (Object.keys(val).length > 0) {
          failed = true;
          validationResult[sail.name || sail.id] = val;
          return;
        }
        if (!sailInConfig) {
          // Provided a new valid Sail
          if (!configuration.sails) {
            configuration.sails = [];
          }
          configuration.sails.push(sail);
          // New sails are not active by default
          sail.active = false; 
          sail.reducedState = {
            reefs: sail.continuousReefing ? undefined : 0,
            furledRatio: sail.continuousReefing ? 0: undefined,
          };
        } else {
          // Existing Sail, update with a valid configuration
          sailInConfig.name = sail.name;
          sailInConfig.description = sail.description;
          sailInConfig.type = sail.type;
          sailInConfig.material = sail.material;
          sailInConfig.brand = sail.brand;
          sailInConfig.area = sail.area;
          sailInConfig.minimumWind = sail.minimumWind;
          sailInConfig.maximumWind = sail.maximumWind;
          sailInConfig.reefs = sail.reefs || [];
          sailInConfig.continuousReefing = !!sail.continuousReefing;
          if (sail.reducedState) {
            // If reducedState is provided, use it, otherwise reset to default
            sailInConfig.reducedState = {
              reefs: sail.continuousReefing ? undefined : 0,
              furledRatio: sail.continuousReefing ? 0: undefined,
            };
          } else {
            // Reset to default
            sailInConfig.reducedState = undefined;
          }
        }
      });
      // Deactivate any saild _not_ provided in payload
      const payloadIds = req.body.map((s) => s.id);
      configuration.sails.filter((s) => !payloadIds.includes(s.id)).forEach((s) => {
        s.active = false;
      });
      if (failed) {
        res.status(400).send(JSON.stringify(validationResult));
        return;
      }
      app.savePluginOptions(configuration, function (err) {
        if (err) {
          res.sendStatus(500);
          return;
        }
        setDeltas();
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
      let validationResult = {}
      req.body.forEach(function (sail) {
        const sailInConfig = configuration.sails.find((s) => s.id === sail.id);
        let val = {}
        if (!sailInConfig)
          val["id"] = "Sail Id not found in configuration!" 
        const validator = new UpdateValidator(sailInConfig && Array.isArray(sailInConfig.reefs) ? sailInConfig.reefs.length : undefined);
        Object.assign(val, validator.validate(sail));
        if (Object.keys(val).length > 0) {
          // Trying to set state to unknown sail or invalid status, fail
          failed = true;
          validationResult[sail.id] = val;
          return;
        }
        sailInConfig.active = sail.active;
        setState(sailInConfig, sail.reducedState);
      });
      // Deactivate any saild _not_ provided in payload
      const payloadIds = req.body.map((s) => s.id);
      configuration.sails.filter((s) => !payloadIds.includes(s.id)).forEach((s) => {
        s.active = false;
      });
      if (failed) {
        res.status(400).send(JSON.stringify(validationResult));
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
      // If active is provided, use it, otherwise do not change
      const validator = new StatusValidator();
      const val = validator.validate(req.body);
      if (Object.keys(val).length > 0) {
        res.status(400).send(JSON.stringify(val));
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
      // If reducedState is provided, use it, otherwise do not change
      const validator = new StateValidator(Array.isArray(sailInConfig.reefs) ? sailInConfig.reefs.length : undefined);
      const val = validator.validate(req.body);
      if (Object.keys(val).length > 0) {
        res.status(400).send(JSON.stringify(val));
        return;
      }
      setState(sailInConfig, req.body);
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
