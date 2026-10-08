# Sails configuration and inventory
Signal K Node server plugin to configure and manage a vessel's sails inventory and current configuration.

## Deprecation Notice
This plugin has been re-baselined on the orginal SailConfiguration plugin but adds Sail Management functionality via REST APIs. This has been proposed as PR to the maintainers. Once the PR is accepted, this additional plugin may be obsolete and could be deprecated.  

## Plugin Config Update
Regardless if moving to @signalk-sailsconfiguration or upgrading from an earlier version of signalk-sailsconfig, the plugin configuration file needs to be upgraded to the latest structure. Instead of re-creating from scratch you can use your preferred AI chat solution (eg. Claude, ChatGPT, etc.) by leverarging the attached [prompt](./plogin-config.md#sail-configuration-transformation-instructions).


## Release History
See [Changelog](CHANGELOG.md).

## Testing
The plugin ships with a baseline and lifecycle test suite that runs on the built-in Node.js test runner, without a Signal K server, an express app or any network access:

```bash
npm test
```

| File | Scope |
| --- | --- |
| [test/plugin.test.js](./test/plugin.test.js) | Plugin baseline (interface, schema, OpenAPI, routes) and lifecycle (deltas, sail areas, start/stop) |
| [test/api.test.js](./test/api.test.js) | Lifecycle of the REST API endpoints under `/sails` |
| [test/validator.test.js](./test/validator.test.js) | Validation rules for sails, updates, status and reefing state |
| [test/support/stubs.js](./test/support/stubs.js) | Stand-ins for the Signal K `app` object and the express router |
