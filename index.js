/*
    Copyright © 2021 Inspired Technologies GmbH (www.inspiredtechnologies.eu)
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

module.exports = function(app) {
  let plugin = {};
  let timer;

  plugin.start = function(props) {
    debug("starting");
    timer = setInterval(_ => {
      const values = (props.sails || []).map(sail => {
        return {
          path: "sails." + sail.id,
          value: sail.state > 0 ? sail.state : null
        };
      });
      app.handleMessage(pluginId, {
        updates: [
          {
            values: values
          }
        ]
      });
    }, props.deltaInterval * 1000);
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
    "Plugin to define your server's sails inventory and configuration";

  plugin.schema = {
    type: "object",
    required: ["deltaInterval"],
    properties: {
      deltaInterval: {
        type: "number",
        default: 60
      },
      sails: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "name", "type", "area"],
          properties: {
            id: {
              type: "string",
              title: "Id"
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
              title: "Brand",
              description: "[Optional] The brand, make or manufacturer of the sail"
            },
            type: {
              type: "string",
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
              description: "Indicates wether this sail is currently in use or not, null value means inactive"
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
                    title: "Corresponding fraction of sail open 0..1"
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  return plugin;
};
