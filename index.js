/*
    Copyright © 2024 Inspired Technologies GmbH (www.inspiredtechnologies.eu)
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

const pluginId = "signalk-sailsconfig";
const debug = require("debug")(pluginId);
const { v4: uuidv4 } = require('uuid');
const sails = require('./sails')

module.exports = function(app) {
  let plugin = {};
  let timer;
  let registered = false;
  
  plugin.start = function(props, restartPlugin) {
    debug("starting");
    app.setPluginStatus("starting");

    if (sails.init(props.sails, pluginId, props.putToken, props.deltaInterval, log))
    {
      sails.update(props, app.savePluginOptions, restartPlugin)
      registered = sails.register(app.registerPutHandler, props.sails, { read: app.getSelfPath, publish: sendDelta }, { delta: sendDelta, meta: sendMeta}, app.setPluginStatus)
    }
    else
      app.setPluginError('Error initializing plugin');


    timer = setInterval(_ => {
      const values = registered ? sails.config(sails.list(true)) : 
      (props.sails || []).map(sail => {
        return {
          path: "sails." + sail.label,
          value: sail.state && sail.state > 0 ? 
           {
              reduced: sail.states[sail.state-1].value!=0,
              reefs: sail.state-1,
              furledRatio: 1-sail.states[sail.state-1].value
           }
          : null
        };
      });
      sendDelta(values);
    }, props.deltaInterval * 1000);

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
      router.get('/vessels/self/sails/inventory/'+sail+'/area', sails.area)
      router.get('/vessels/' + app.selfId + '/sails/inventory/'+sail+'/area', sails.area)  
    })
    router.post('/vessels/self/sails/inventory', sails.endpoint)
    app.debug("'inventory' endpoint registered");
    return router
  }

  plugin.id = pluginId;
  plugin.name = "Sails Configuration";
  plugin.description =
    "Plugin to define your server's sails inventory and configuration";

  plugin.schema = {
    type: "object",
    required: ["deltaInterval", "putToken"],
    properties: {
      deltaInterval: {
        type: "number",
        default: 60
      },
      putToken: {
        type: "string",
        default: "SailsConfig/1.0.0"
      },
      sails: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "name", "type", "area"],
          properties: {
            id: {
              type: "string",
              title: "Id",
              default: uuidv4()
            },
            label: {
              type: "string",
              title: "Label",
            },
            name: {
              type: "string",
              title: "Name",
              description: "An unique identifier by which the crew identifies a sail"
            },
            material: {
              type: "string",
              title: "Material",
              description: "[Optional] The material the sail is made from"
            },
            brand: {
              type: "string",
              title: "Brand",
              description: "[Optional] The brand, make or manufacturer of the sail"
            },
            type: {
              type: "string",
              title: "Type",
              enum: ["main", "jib", "genoa", "staysail", "spinnaker", "genakker", "code0", "blister", "parasailor", "other"],
              description: "The type of sail" 
            },
            area: {
              type: "number",
              title: "Area",
              description: "The total area of this sail in square meters, units: m2 (square meter)"
            },
            wind: {
              type: "object",
              title: "Usage",
              properties: {
                min: {
                  type: "number",
                  title: "Minimum",
                  description: "The minimum wind speed this sail can be used with, units: m/s (meters per second)"
                },
                max: {
                  type: "number",
                  title: "Maximum",
                  description: "The maximum wind speed this sail can be used with, units: m/s (meters per second)"
                },
              }
            },
            state: {
              type: "number",
              title: "State",
              description: "Indicates wether this sail is currently in use or not, null value means inactive",
              default: 0
            },
            states: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    title: "State or Reef name",
                    description: "Indicates number of reefs set, 0 means full"
                  },
                  value: {
                    type: "number",
                    title: "Corresponding fraction of sail open 0..1",
                    description: "Ratio of sail out, 1 means full and 0 is completely furled in",
                    default: 1
                  }
                }
              }
            }
          }
        }
      }
    }
  };

    /**
   * 
   * @param {Array<[{path:path, value:value}]>} values 
   */
     function sendDelta(values) {
      app.handleMessage(pluginId, {
          updates: [
              {
                  values: values
              }
          ]
      });
  }

  function sendMeta(units) {
      app.handleMessage(pluginId, {
          updates: [
              {
                  meta: units
              }
          ]   
      })
  }

  function log(msg) { app.debug(msg); }

  return plugin;
};
