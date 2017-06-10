/*
 * Copyright 2017 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const pluginId = "sailsconfiguration";
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
    "Plugin that allows you to define your server's sails inventory and configuration";

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
              title: "Name"
            },
            description: {
              type: "string",
              title: "Description"
            },
            type: {
              type: "string",
              enum: ["main", "gyb", "spinnaker", "codezero"]
            },
            area: {
              type: "number",
              title: "Area"
            },
            state: {
              type: "number",
              title: "State"
            },
            states: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    title: "State name"
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
