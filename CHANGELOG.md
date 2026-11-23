# Changelog

## [0.9.9]
- Re-baselined to v1.2.1 of @signalk/sailsconfiguration: route access levels on Signal K 2.x - reading the sails needs readonly, changing their state readwrite, editing the inventory (POST /sails) stays admin
- Fix: POST /sails starts the inventory when no configuration is stored yet; GET / PUT answer like "no inventory" when the configuration holds no sails
- Fix: editing a sail keeps the provided reefing state (in the sail's reefing mode) instead of resetting it
- Tests for the access levels, the missing inventory and the reefing state on edit; generated files built before the tests (`pretest`)
- TypeScript 7 as dev dependency, `validator.js` built as CommonJS (ES2022)
- License: Apache 2.0 as the upstream @signalk/sailsconfiguration (was stated as MIT)
- Workflows: current action versions, release artifact name fixed (`signalk-sailsconfig-*.tgz`), CI also on `dev`
- CLAUDE.md git- and npm-ignored

## [0.9.8]
- preRelease v1 - aligning test & CI pre-requisites
- added baseline and lifecycle tests for the plugin, the REST API and the validators

## [0.9.5]
- SailManagement for @signalk/sailsconfiguration (PR to v1.2.0)

## [0.9.0]
- Re-baselined to v1.1.0 of @signalk/sailsconfiguration

## [0.6.x]
- Maintenance releases with package bumps

## [0.4.0]
- REST API for App Integration

## [0.2.1]
- Initial public release